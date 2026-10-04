import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { appOrigin, googleCredentials } from "@/lib/server/google-drive";
import { ApiError, errorResponse, signCookie, readSigned, SESSION_COOKIE } from "@/lib/server/prototype-auth";
import { cookies } from "next/headers";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user.storage_consent_at || !user.user_name) throw new ApiError("Add your name and accept the repository terms before connecting Google.");
    const { client_id } = googleCredentials();
    const calendarSync = new URL(request.url).searchParams.get("calendar") === "1";
    const session = readSigned<{ exp: number }>((await cookies()).get(SESSION_COOKIE)?.value);
    if (!session) throw new ApiError("Log in again before connecting Google.", 401);
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    // Folder traversal, shared repositories, and explicit event insertion require
    // Drive access and calendar event creation permission for this short session.
    const scope = `openid email https://www.googleapis.com/auth/drive${calendarSync ? " https://www.googleapis.com/auth/calendar.events" : ""}`;
    const query = new URLSearchParams({ client_id, redirect_uri: `${appOrigin()}/api/google/callback`, response_type: "code", scope, access_type: "online", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
    // OAuth returns via a cross-site navigation, so this cookie must be Lax.
    const remaining = Math.max(1, Math.min(600, Math.floor((session.exp - Date.now()) / 1000)));
    response.cookies.set("healthnest-google-state", signCookie({ state, verifier, userId: user.id, calendarSync, sessionExpiresAt: session.exp }, remaining), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: remaining });
    return response;
  } catch (error) { return errorResponse(error); }
}
