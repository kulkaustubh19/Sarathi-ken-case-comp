import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { DRIVE_SESSION_COOKIE } from "@/lib/server/google-drive";
export async function POST(request: Request) {
  try { checkOrigin(request); await requireUser(); const response = NextResponse.json({ success: true }); response.cookies.set(DRIVE_SESSION_COOKIE, "", { path: "/", maxAge: 0 }); response.cookies.set("healthnest-google-state", "", { path: "/", maxAge: 0 }); return response; }
  catch (error) { return errorResponse(error); }
}
