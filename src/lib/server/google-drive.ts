import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "./prototype-auth";
import { db, eq } from "./database";
import { safeSegment } from "../documents";
import type { LoginUser } from "./login-store";

export type DriveConnection = { user_id: string; google_sub: string; google_email: string; repository_folder_id: string };
export const DRIVE_SESSION_COOKIE = "healthnest-drive-session";
const testSessions = new Map<string, string>();
const testCalendar = new Set<string>();
export function setTestDriveSession(userId: string, accessToken: string, calendarSync = false) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test Drive sessions are only available in tests.");
  testSessions.set(userId, accessToken);
  if (calendarSync) testCalendar.add(userId); else testCalendar.delete(userId);
}
export async function connection(userId: string) { return (await db<DriveConnection>("drive_connections", `?user_id=eq.${eq(userId)}&limit=1`))[0] || null; }
function encryptionKey() {
  if ((process.env.AUTH_COOKIE_SECRET?.length || 0) < 32) throw new ApiError("Set AUTH_COOKIE_SECRET to at least 32 characters before connecting Google.", 503);
  return createHash("sha256").update(process.env.AUTH_COOKIE_SECRET!).digest();
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function decryptToken(value: string) {
  const data = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}
export function googleCredentials() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new ApiError("Google Drive is not connected yet. Configure the Google OAuth client in .env.local.", 503);
  return { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET };
}
export function appOrigin() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const origin = process.env.APP_URL || (host ? `https://${host}` : "http://localhost:8080");
  const parsed = new URL(origin);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new ApiError("Configure a valid APP_URL.", 503);
  return parsed.origin;
}
export async function tokenRequest(fields: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...googleCredentials(), ...fields }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ApiError("Google authorization expired or failed. Connect Google Drive again.", 503);
  return response.json() as Promise<{ access_token: string; refresh_token?: string }>;
}
export async function ownerDrive(userId: string) {
  const session = await googleSession(userId);
  if (!session) throw new ApiError("Your Google Drive authorization expired. Reauthorize Drive during this 10-minute login session.", 401);
  const stored = await connection(userId);
  if (!stored) throw new ApiError("Authorize Google Drive during this login session to access your repository.", 409);
  return { stored, token: session.accessToken };
}
export function readDriveSession(value: string | undefined, userId: string) {
  if (!value) return null;
  try {
    const session = JSON.parse(decryptToken(value)) as { userId: string; accessToken: string; expiresAt: number; calendarSync?: boolean };
    return session.userId === userId && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}
export async function hasDriveSession(userId: string) {
  return Boolean(await googleSession(userId));
}
export async function googleSession(userId: string) {
  if (process.env.NODE_ENV === "test") return !testSessions.has(userId) ? null : { userId, accessToken: testSessions.get(userId)!, expiresAt: Date.now() + 600000, calendarSync: testCalendar.has(userId) };
  return readDriveSession((await cookies()).get(DRIVE_SESSION_COOKIE)?.value, userId);
}
export async function driveRequest<T>(token: string, endpoint: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    if (response.status === 404) throw new ApiError("The Google Drive folder or file is unavailable. Check its link and access.", 404);
    throw new ApiError("Google Drive could not complete the operation. Check your account permissions and storage quota.", 503);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export async function folder(token: string, name: string, parent?: string, key?: string) {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escape(name)}'${parent ? ` and '${escape(parent)}' in parents` : " and 'root' in parents"}${key ? ` and appProperties has { key='healthnestOwner' and value='${escape(key)}' }` : ""}`;
  const existing = await driveRequest<{ files: { id: string }[] }>(token, `files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (existing.files[0]) return existing.files[0].id;
  const created = await driveRequest<{ id: string }>(token, "files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}), ...(key ? { appProperties: { healthnestOwner: key } } : {}) }) });
  return created.id;
}
export async function prepareRepository(token: string, user: LoginUser, existing: DriveConnection | null) {
  if (existing) { await driveRequest(token, `files/${encodeURIComponent(existing.repository_folder_id)}?fields=id`); return existing.repository_folder_id; }
  let parent: string | undefined;
  if (user.drive_folder_url) {
    parent = user.drive_folder_url.match(/\/folders\/([\w-]+)/)?.[1];
    if (!parent) throw new ApiError("Invalid Google Drive folder link.");
    const info = await driveRequest<{ mimeType: string; ownedByMe: boolean; permissions?: { type: string; role: string }[] }>(token, `files/${encodeURIComponent(parent)}?fields=mimeType,ownedByMe,permissions(type,role)`);
    if (info.mimeType !== "application/vnd.google-apps.folder" || !info.ownedByMe) throw new ApiError("Choose a private folder owned by your connected Google account.");
    if (info.permissions?.some(permission => permission.role !== "owner")) throw new ApiError("This folder already has shared access. Choose a private folder so Sarathi can control sharing.");
  }
  return folder(token, `Sarathi - ${safeSegment(user.user_name || "My family")}`, parent, user.id);
}
export async function deletePermission(token: string, folderId: string, permissionId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions/${encodeURIComponent(permissionId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok && response.status !== 404) throw new ApiError("Google Drive could not revoke access. Retry removal; access has been blocked in Sarathi meanwhile.", 503);
}
