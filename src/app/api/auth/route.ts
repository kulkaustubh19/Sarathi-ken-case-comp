import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApiError, assertPrototype, CHALLENGE_COOKIE, checkOrigin, demoOtp, errorResponse, normalizeEmail, normalizePhone, otpMatches, readSigned, SESSION_COOKIE, sessionUserId, setCookie, signCookie, SESSION_TTL_SECONDS } from "@/lib/server/prototype-auth";
import { createUser, findUser, recordPrivacyConsent } from "@/lib/server/login-store";
import { profileInput } from "@/lib/server/profile";
import { DRIVE_SESSION_COOKIE } from "@/lib/server/google-drive";

export const runtime = "nodejs";
type Challenge = { phone: string; email?: string; mode: "signup" | "login"; profile?: { user_name: string; drive_folder_url: string | null }; privacy_consent?: boolean };
export async function GET() {
  try {
    const id = await sessionUserId();
    const user = id ? await findUser("id", id) : null;
    return NextResponse.json({ user, prototype: true, otp: demoOtp() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertPrototype();
    checkOrigin(request);
    const body = await request.json().catch(() => { throw new ApiError("Invalid request."); });
    if (!body || typeof body !== "object") throw new ApiError("Invalid request.");
    if (body.action === "logout") {
      const response = NextResponse.json({ success: true });
      setCookie(response, SESSION_COOKIE, "", 0);
      setCookie(response, CHALLENGE_COOKIE, "", 0);
      setCookie(response, DRIVE_SESSION_COOKIE, "", 0);
      setCookie(response, "healthnest-google-state", "", 0);
      return response;
    }
    if (body.action === "request-otp") {
      if (body.mode !== "signup" && body.mode !== "login") throw new ApiError("Choose login or signup.");
      const phone = normalizePhone(body.phone);
      const email = body.mode === "signup" ? normalizeEmail(body.email) : undefined;
      const profile = body.mode === "signup" ? profileInput(body) : undefined;
      if (body.mode === "login" && body.storage_consent !== true) throw new ApiError("Review and accept the Sarathi session and privacy terms before requesting an OTP.");
      const existing = await findUser("mobile_number", phone);
      if (body.mode === "signup" && existing) throw new ApiError("This number already has an account. Choose Log in.", 409);
      if (body.mode === "login" && !existing) throw new ApiError("No account found. Choose Sign up first.", 404);
      const response = NextResponse.json({ success: true, phone, prototype: true, otp: demoOtp(), message: "No SMS is sent in prototype mode." });
      setCookie(response, CHALLENGE_COOKIE, signCookie({ phone, email, profile, mode: body.mode, privacy_consent: body.storage_consent === true }, 300), 300);
      return response;
    }
    if (body.action === "verify-otp") {
      const challenge = readSigned<Challenge>((await cookies()).get(CHALLENGE_COOKIE)?.value);
      if (!challenge) throw new ApiError("Your code request expired. Request a new code.", 401);
      if (typeof body.otp !== "string" || !otpMatches(body.otp)) throw new ApiError("Incorrect prototype code. Please try again.", 401);
      if (challenge.mode === "signup") {
        if (!challenge.profile) throw new ApiError("Please start signup again and provide your name and storage consent.");
        await createUser(challenge.phone, normalizeEmail(challenge.email), challenge.profile);
        const response = NextResponse.json({ success: true, registered: true });
        setCookie(response, CHALLENGE_COOKIE, "", 0);
        setCookie(response, SESSION_COOKIE, "", 0);
        return response;
      }
      const user = await findUser("mobile_number", challenge.phone);
      if (!user) throw new ApiError("Account not found. Please sign up.", 404);
      if (!challenge.privacy_consent) throw new ApiError("Please start login again and accept the Sarathi privacy terms.");
      await recordPrivacyConsent(user.id);
      const runId = newAgentRunId(user.id);
      await logAgentEvent(runId, "user_input", { connector: "Sarathi login", source: "Browser OTP verification form", action: "verify-otp", otp: "omitted" });
      await logAgentEvent(runId, "decision", { decided: "Start authenticated 10-minute session", why: "Require matching prototype OTP, existing account, and accepted privacy consent before access.", through: "Sarathi login", to: "Signed-in user", action: "Issue signed session cookie; credential omitted" });
      const response = NextResponse.json({ success: true, user });
      setCookie(response, SESSION_COOKIE, signCookie({ userId: user.id }, SESSION_TTL_SECONDS), SESSION_TTL_SECONDS);
      setCookie(response, CHALLENGE_COOKIE, "", 0);
      return response;
    }
    throw new ApiError("Unknown action.");
  } catch (error) { return errorResponse(error); }
}
