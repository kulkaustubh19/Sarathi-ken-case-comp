import { createHash } from "node:crypto";
import { googleSession } from "./google-drive";
import { patchLocalEvent, type LocalEvent } from "./local-health-data";
import { ApiError } from "./prototype-auth";
import { tracedPartnerFetch } from "./partner-trace";
import { newAgentRunId } from "./agent-run-log";

const running = new Map<string, Promise<{ synced: boolean; url?: string; warning?: string }>>();
export async function syncGoogleEvent(userId: string, event: LocalEvent) {
  if (event.owner_id !== userId) throw new ApiError("Only your own care tasks can be synced.", 403);
  if (event.calendar_status === "synced") return { synced: true, url: event.url };
  const session = await googleSession(userId);
  if (!session?.calendarSync) return { synced: false, warning: "Saved in Care Tasks. Connect Google with Calendar sync enabled to sync this event." };
  const key = `${userId}:${event.id}`;
  if (running.has(key)) return running.get(key)!;
  const work = (async () => {
    try {
      const id = createHash("sha256").update(key).digest("hex");
      const endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
      const headers = { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" };
      const runId = newAgentRunId(userId);
      let response = await tracedPartnerFetch(runId, "Google Calendar", endpoint, { method: "POST", headers, body: JSON.stringify({ id, summary: event.title, description: event.description, start: { dateTime: event.starts_at, timeZone: "Asia/Kolkata" }, end: { dateTime: new Date(Date.parse(event.starts_at) + 1800000).toISOString(), timeZone: "Asia/Kolkata" }, reminders: { useDefault: true } }), cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (response.status === 409) response = await tracedPartnerFetch(runId, "Google Calendar", `${endpoint}/${id}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Calendar request failed");
      const result = await response.json();
      if (result.id !== id) throw new Error("Unexpected Calendar event");
      const url = typeof result.htmlLink === "string" && result.htmlLink.startsWith("https://www.google.com/calendar/") ? result.htmlLink : `https://calendar.google.com/calendar/u/0/r`;
      await patchLocalEvent(userId, event.id, { calendar_status: "synced", google_event_id: id, url });
      return { synced: true, url };
    } catch {
      await patchLocalEvent(userId, event.id, { calendar_status: "failed" });
      return { synced: false, warning: "The care task was saved, but Google Calendar sync failed. Reconnect Google if needed, then retry from Tasks." };
    }
  })();
  running.set(key, work);
  try { return await work; } finally { running.delete(key); }
}
