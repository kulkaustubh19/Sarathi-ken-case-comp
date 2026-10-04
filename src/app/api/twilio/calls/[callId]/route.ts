import { NextResponse } from "next/server";
import { getTrialCall } from "@/rails/gnani/twilio";
import { requireUser } from "@/lib/server/profile";
import { ApiError, errorResponse } from "@/lib/server/prototype-auth";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const user = await requireUser(); const { callId } = await params; const call = getTrialCall(callId);
    if (!call || call.ownerId !== user.id) throw new ApiError("Call not found or expired.", 404);
    const { ownerId, ...result } = call; void ownerId;
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

