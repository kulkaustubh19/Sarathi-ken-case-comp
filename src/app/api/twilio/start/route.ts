import { NextResponse } from "next/server";
import { startTwilioTrialCall } from "@/rails/gnani";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser();
    const body = await request.json().catch(() => null);
    const item = body?.useCase === "lab_inquiry" ? body.testName : body?.useCase === "pharmacy_inquiry" ? body.medicineName : null;
    if (typeof item !== "string" || !item.trim() || item.length > 80) throw new ApiError("Enter a test or medicine name of up to 80 characters.");
    if (process.env.VERCEL) throw new ApiError("Use the in-app Gnani simulation on this hosted prototype; trial phone calls require the local demo server.", 503);
    return NextResponse.json(await startTwilioTrialCall(body, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error instanceof ApiError ? error : new ApiError(error instanceof Error ? error.message : "Unable to start a trial call.", 503)); }
}

