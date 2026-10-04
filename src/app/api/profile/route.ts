import { NextResponse } from "next/server";
import { checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { profileInput, requireUser } from "@/lib/server/profile";
import { updateProfile } from "@/lib/server/login-store";
import { googleSession, connection } from "@/lib/server/google-drive";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await requireUser();
    const session = await googleSession(user.id);
    const stored = session ? await connection(user.id) : null;
    return NextResponse.json({ user, hosted: Boolean(process.env.VERCEL), max_upload_mb: process.env.VERCEL ? 4 : 25, drive: { connected: Boolean(session && stored), google_email: stored?.google_email, calendar_sync: Boolean(session?.calendarSync) }, google_configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), storage_mode: "hybrid", consent_mode: process.env.SHARING_CONSENT_MODE || "prototype" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const body = await request.json();
    const profile = profileInput(body);
    return NextResponse.json({ user: await updateProfile(user.id, profile) });
  } catch (error) { return errorResponse(error); }
}
