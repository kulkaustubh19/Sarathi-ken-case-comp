import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./prototype-auth";

export type LoginUser = { id: string; mobile_number: string; email: string; created_at: string; user_name?: string | null; drive_folder_url?: string | null; storage_consent_at?: string | null; storage_consent_version?: string | null };
const directory = path.join(process.cwd(), ".data");
const filename = path.join(directory, "login-users.json");
let queue: Promise<unknown> = Promise.resolve();
function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (Boolean(url) !== Boolean(key)) throw new ApiError("Configure both Supabase URL and server secret key.", 503);
  if (!url && process.env.NODE_ENV === "production") throw new ApiError("Configure Supabase before hosting; the local file store is development-only.", 503);
  return Boolean(url && key);
}
async function database(query: string, init?: RequestInit): Promise<LoginUser[]> {
  let response: Response;
  try {
    response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/login_users${query}`, {
      ...init, cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException;
    console.error("Supabase login store request failed", { name: failure.name, code: failure.cause && typeof failure.cause === "object" && "code" in failure.cause ? failure.cause.code : failure.code });
    throw new ApiError("Could not reach Supabase. Check the project URL and server network connection, then retry.", 503);
  }
  if (response.status === 409) throw new ApiError("This mobile number already has an account. Please log in.", 409);
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    console.error("Supabase login store rejected a request", { status: response.status, code: details.code });
    if (details.code === "PGRST205") throw new ApiError("The login_users table is missing in the connected Supabase project. Run the login_users SQL migration in that project's SQL Editor.", 503);
    if (["PGRST204", "42703"].includes(details.code)) throw new ApiError("Run the Sarathi documents migration to add name and storage-consent fields.", 503);
    if (response.status === 401 || response.status === 403) throw new ApiError("Supabase denied backend access. Check the server secret key and login_users table permissions.", 503);
    throw new ApiError("User storage is unavailable. Check the Supabase configuration and migration.", 503);
  }
  return response.json();
}
async function localUsers(): Promise<LoginUser[]> {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function findUser(field: "id" | "mobile_number", value: string) {
  if (isSupabaseConfigured()) return (await database(`?${field}=eq.${encodeURIComponent(value)}&select=*&limit=1`))[0] || null;
  await queue;
  return (await localUsers()).find(user => user[field] === value) || null;
}
export async function createUser(phone: string, email: string, profile?: { user_name: string; drive_folder_url: string | null }) {
  const user: LoginUser = { id: randomUUID(), mobile_number: phone, email, created_at: new Date().toISOString(), ...(profile ? { ...profile, storage_consent_at: new Date().toISOString(), storage_consent_version: "healthnest-local-v1" } : {}) };
  if (isSupabaseConfigured()) return (await database("", { method: "POST", body: JSON.stringify(user) }))[0];
  const operation = queue.then(async () => {
    const users = await localUsers();
    if (users.some(existing => existing.mobile_number === phone)) throw new ApiError("This mobile number already has an account. Please log in.", 409);
    await mkdir(directory, { recursive: true });
    const temp = `${filename}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify([...users, user], null, 2), { mode: 0o600 });
    await rename(temp, filename);
    return user;
  });
  queue = operation.catch(() => undefined);
  return operation;
}
export async function updateProfile(id: string, profile: { user_name: string; drive_folder_url: string | null }) {
  const patch = { ...profile, storage_consent_at: new Date().toISOString(), storage_consent_version: "healthnest-local-v1" };
  if (isSupabaseConfigured()) return (await database(`?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }))[0];
  const operation = queue.then(async () => {
    const users = await localUsers();
    const user = users.find(existing => existing.id === id);
    if (!user) throw new ApiError("Account not found.", 404);
    Object.assign(user, patch);
    await mkdir(directory, { recursive: true });
    const temp = `${filename}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(users, null, 2), { mode: 0o600 });
    await rename(temp, filename);
    return user;
  });
  queue = operation.catch(() => undefined);
  return operation;
}

export async function recordPrivacyConsent(id: string) {
  const patch = { storage_consent_at: new Date().toISOString(), storage_consent_version: "healthnest-local-v1" };
  if (isSupabaseConfigured()) return (await database(`?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }))[0];
  const operation = queue.then(async () => {
    const users = await localUsers(); const user = users.find(existing => existing.id === id);
    if (!user) throw new ApiError("Account not found.", 404);
    Object.assign(user, patch); await mkdir(directory, { recursive: true });
    const temp = `${filename}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(users, null, 2), { mode: 0o600 }); await rename(temp, filename); return user;
  });
  queue = operation.catch(() => undefined); return operation;
}
