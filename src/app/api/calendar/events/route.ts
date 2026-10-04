import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { syncGoogleEvent } from "@/lib/server/google-calendar";
import { localEvents, addLocalEvent } from "@/lib/server/local-health-data";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";

export const runtime = "nodejs";
function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); const body = await request.json().catch(() => { throw new ApiError("Invalid calendar request."); });
    if (typeof body.event_id === "string") {
      const event = (await localEvents(user.id)).find(item => item.id === body.event_id && item.owner_id === user.id);
      if (!event) throw new ApiError("Choose one of your own care tasks.", 404);
      return NextResponse.json(await syncGoogleEvent(user.id, event));
    }
    if (body.confirmed !== true) throw new ApiError("Confirm the proposed reminder before adding it.");
    if (!(["follow_up", "medicine"] as string[]).includes(body.type)) throw new ApiError("Choose a supported reminder type.");
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 150 || typeof body.description !== "string" || body.description.length > 1200 || !validDate(body.date)) throw new ApiError("Provide a reminder title, date, and short description.");
    if (body.type === "medicine" && (typeof body.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))) throw new ApiError("Only add a medicine alert at a time explicitly stated in the prescription.");
    const event = await addLocalEvent(user.id, { title: body.title.trim(), description: body.description.trim(), starts_at: new Date(`${body.date}T${typeof body.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : "09:00"}:00+05:30`).toISOString() });
    const runId = newAgentRunId(user.id); await logAgentEvent(runId, "message_sent", { channel: "Sarathi tasks", message: "Added reminder to the local Sarathi task list." });
    const calendar = body.sync_google === false ? { synced: false } : await syncGoogleEvent(user.id, event);
    return NextResponse.json({ success: true, id: event.id, local_only: !calendar.synced, ...calendar }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
