import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Deliberately a prototype. Never use fixed OTPs to protect real healthcare data.
const temporarySecret = randomBytes(32).toString("hex");
export const SESSION_COOKIE = "care-session";
export const CHALLENGE_COOKIE = "care-challenge";
export const SESSION_TTL_SECONDS = 10 * 60;
export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function assertPrototype() {
  if (process.env.AUTH_MODE && process.env.AUTH_MODE !== "prototype") {
    throw new ApiError("This build only supports prototype authentication.", 503);
  }
  if (process.env.AUTH_MODE !== "prototype" && process.env.NODE_ENV === "production") {
    throw new ApiError("Set AUTH_MODE=prototype to enable this demo's fixed OTP login.", 503);
  }
  if (process.env.NODE_ENV === "production" && (process.env.AUTH_COOKIE_SECRET?.length || 0) < 32) {
    throw new ApiError("Configure AUTH_COOKIE_SECRET with at least 32 characters before hosting the prototype.", 503);
  }
}
export function demoOtp() { return process.env.PROTOTYPE_OTP || "123456"; }
export function otpMatches(value: string) {
  const a = Buffer.from(value);
  const b = Buffer.from(demoOtp());
  return a.length === b.length && timingSafeEqual(a, b);
}
function signature(value: string) {
  return createHmac("sha256", process.env.AUTH_COOKIE_SECRET || temporarySecret).update(value).digest("base64url");
}
export function signCookie(data: Record<string, unknown>, seconds: number) {
  const value = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + seconds * 1000 })).toString("base64url");
  return `${value}.${signature(value)}`;
}
export function readSigned<T>(value?: string): T | null {
  if (!value) return null;
  const [payload, mac, extra] = value.split(".");
  if (!payload || !mac || extra) return null;
  const actual = Buffer.from(mac);
  const expected = Buffer.from(signature(payload));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.exp === "number" && data.exp > Date.now() ? data as T : null;
  } catch { return null; }
}
export function setCookie(response: NextResponse, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge });
}
export async function sessionUserId() {
  assertPrototype();
  const data = readSigned<{ userId: string }>((await cookies()).get(SESSION_COOKIE)?.value);
  return data?.userId || null;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new ApiError("Request origin is not allowed.", 403); }
    const expectedHost = request.headers.get("host") || new URL(request.url).host;
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== expectedHost) throw new ApiError("Request origin is not allowed.", 403);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "The service is unavailable. Please try again." }, { status: 503 });
}
export function normalizePhone(value: unknown) {
  if (typeof value !== "string") throw new ApiError("Enter a mobile number.");
  const trimmed = value.trim().replace(/[\s()-]/g, "");
  const phone = /^\d{10}$/.test(trimmed) ? `+91${trimmed}` : trimmed;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new ApiError("Enter 10 Indian digits, or include your country code (for example +91).");
  return phone;
}
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new ApiError("Enter a valid email address.");
  return value.trim().toLowerCase();
}
