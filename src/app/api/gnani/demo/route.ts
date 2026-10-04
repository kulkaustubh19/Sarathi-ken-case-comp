import { NextResponse } from "next/server";
import { GnaniError, GnaniSpeechClient, runVoiceDemo } from "@/rails/gnani";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
import { completeVoiceBooking } from "@/lib/server/booking-flow";
import type { VoiceDemoInput } from "@/rails/gnani/demo";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser();
    const body = await request.json().catch(() => null);
    if (!process.env.GNANI_API_KEY) throw new ApiError("Gnani voice is not configured. Add GNANI_API_KEY to .env.local and restart the server.", 503);
    async function simulate(input: VoiceDemoInput, runId: string) {
      const item = input.useCase === "lab_inquiry" ? input.testName : input.medicineName;
    await logAgentEvent(runId, "user_input", { connector: "Sarathi voice screen", source: "Authenticated browser → POST /api/gnani/demo", input, mode: "scripted simulation" });
    await logAgentEvent(runId, "decision", { decided: input.useCase, why: "Use the explicit lab or pharmacy selection; disclose an automated call; simulation is not a provider booking.", to: "Demo operator", through: "Gnani audio" });
    await logAgentEvent(runId, "tool_call", { provider: "Gnani", operation: "voice inquiry simulation", use_case: input.useCase, item });
    const result = await runVoiceDemo(input, new GnaniSpeechClient(process.env.GNANI_API_KEY!, runId));
    await logAgentEvent(runId, "tool_response", { provider: "Gnani", operation: "voice inquiry simulation", result: result.result });
    for (const turn of result.turns) await logAgentEvent(runId, turn.speaker === "staff" ? "connector_input" : "message_sent", { connector: "Gnani simulation", source: turn.source, to: turn.speaker === "staff" ? "Sarathi agent" : "Scripted demo operator", speaker: turn.speaker, message: turn.text, scripted: true });
    await logAgentEvent(runId, "decision", { input: result.turns.filter(turn => turn.speaker === "staff").map(turn => turn.text), decided: result.result, why: "Extract only supported availability, slot, preparation and price fields from the transcript; flag missing fields rather than invent facts.", through: "Sarathi voice screen", to: "Signed-in user" });
      return result;
    }
    if (typeof body?.booking_id === "string") return NextResponse.json(await completeVoiceBooking(user, body.booking_id, simulate), { headers: { "Cache-Control": "no-store" } });
    const item = body?.useCase === "lab_inquiry" ? body.testName : body?.useCase === "pharmacy_inquiry" ? body.medicineName : null;
    if (typeof item !== "string" || !item.trim() || item.length > 80) throw new ApiError("Enter a test or medicine name of up to 80 characters.");
    return NextResponse.json(await simulate(body, newAgentRunId(user.id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error instanceof GnaniError ? new ApiError(error.message, 502) : error); }
}

