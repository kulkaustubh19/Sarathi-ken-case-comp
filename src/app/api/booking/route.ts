import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { bookingSetup, selectVerifiedLab } from "@/lib/server/booking-flow";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const user = await requireUser(); return NextResponse.json(await bookingSetup(user.id, new URL(request.url).searchParams.get("id") || ""), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); const body = await request.json().catch(() => { throw new ApiError("Invalid lab selection."); });
    if (typeof body.lab_id !== "string") throw new ApiError("Select a verified lab.");
    const lab = await selectVerifiedLab(user.id, body.lab_id); const runId = newAgentRunId(user.id);
    await logAgentEvent(runId, "user_input", { connector: "Sarathi verified lab list", source: "User selected a verified candidate", lab_id: lab.id, lab_name: lab.name });
    await logAgentEvent(runId, "decision", { input: { lab_id: lab.id }, decided: { lab_name: lab.name }, why: "Use only a candidate from this user’s recently verified list; respect their explicit lab selection.", through: "Sarathi location screen", to: "Signed-in user" });
    await logAgentEvent(runId, "message_sent", { channel: "Sarathi chat", message: `Selected ${lab.name}. Say “Book a blood test with ${lab.name}” to start the booking simulation.`, to: "Signed-in user" });
    return NextResponse.json({ name: lab.name, id: lab.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
