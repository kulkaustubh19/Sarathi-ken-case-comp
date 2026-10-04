import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, readSigned, sessionUserId } from "@/lib/server/prototype-auth";
import { findUser } from "@/lib/server/login-store";
import { appOrigin, connection, DRIVE_SESSION_COOKIE, encryptToken, prepareRepository, tokenRequest } from "@/lib/server/google-drive";
import { db } from "@/lib/server/database";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const result = new URL("/documents", appOrigin());
  try {
    const query = new URL(request.url).searchParams;
    const state = readSigned<{ userId: string; state: string; verifier: string; calendarSync?: boolean; sessionExpiresAt: number }>((await cookies()).get("healthnest-google-state")?.value);
    if (!state || state.state !== query.get("state") || !query.get("code") || query.has("error")) throw new ApiError("Google connection was cancelled or expired. Try connecting again.");
    if (!state.sessionExpiresAt || state.sessionExpiresAt <= Date.now()) throw new ApiError("Your Sarathi session expired during authorization. Log in again.", 401);
    // Strict session cookies can be absent on the cross-site callback; the signed,
    // short-lived OAuth state binds the callback to the initiating account.
    const activeId = await sessionUserId();
    if (activeId && activeId !== state.userId) throw new ApiError("Sign in to the account that started Google authorization.");
    const user = await findUser("id", state.userId);
    if (!user || !user.storage_consent_at) throw new ApiError("Sign in and accept the storage terms first.");
    const tokens = await tokenRequest({ grant_type: "authorization_code", code: query.get("code")!, code_verifier: state.verifier, redirect_uri: `${appOrigin()}/api/google/callback` }) as { access_token: string; expires_in?: number; scope?: string };
    if (tokens.scope && !tokens.scope.split(" ").includes("https://www.googleapis.com/auth/drive")) throw new ApiError("Drive permission was not granted. Reconnect and approve Drive access.");
    const calendarSync = Boolean(state.calendarSync && (!tokens.scope || tokens.scope.split(" ").includes("https://www.googleapis.com/auth/calendar.events")));
    const identityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
    if (!identityResponse.ok) throw new ApiError("Could not verify your Google account.");
    const identity = await identityResponse.json();
    if (!identity.email_verified || typeof identity.sub !== "string" || typeof identity.email !== "string") throw new ApiError("Use a Google account with a verified email.");
    const stored = await connection(user.id);
    if (stored && stored.google_sub !== identity.sub) throw new ApiError("Reconnect the same Google account to keep your repository intact.");
    const folderId = await prepareRepository(tokens.access_token, user, stored);
    await db("drive_connections", "?on_conflict=user_id", { method: "POST", body: JSON.stringify({ user_id: user.id, google_sub: identity.sub, google_email: identity.email.toLowerCase(), repository_folder_id: folderId }), headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
    const expiresIn = Math.min(600, tokens.expires_in || 600, Math.floor((state.sessionExpiresAt - Date.now()) / 1000));
    if (expiresIn <= 0) throw new ApiError("Your session expired. Log in again.", 401);
    result.searchParams.set("connected", "1");
    const encryptedSession = encryptToken(JSON.stringify({ userId: user.id, accessToken: tokens.access_token, expiresAt: Date.now() + expiresIn * 1000, calendarSync }));
    if (state.calendarSync && !calendarSync) result.searchParams.set("warning", "Drive connected, but Calendar permission was not granted.");
    const response = NextResponse.redirect(result);
    response.cookies.set(DRIVE_SESSION_COOKIE, encryptedSession, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: expiresIn });
    response.cookies.set("healthnest-google-state", "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    result.searchParams.set("error", error instanceof ApiError ? error.message : "Google connection failed. Check your configuration and retry.");
  }
  const response = NextResponse.redirect(result);
  response.cookies.set("healthnest-google-state", "", { path: "/", maxAge: 0 });
  return response;
}
