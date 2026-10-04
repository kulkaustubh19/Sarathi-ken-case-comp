import { googleSession } from "./google-drive";
import { driveDocuments } from "./drive-documents";
import { ensureDemoRepository, localDocuments, localEvents, localMemberOverview } from "./local-health-data";
import type { LoginUser } from "./login-store";

const day = 86400000;
const offset = 330 * 60000;
// Calendar week: Monday 00:00 through next Monday 00:00 in Asia/Kolkata.
export function currentWeek(now = new Date()) {
  const local = new Date(now.getTime() + offset);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = midnight - ((local.getUTCDay() + 6) % 7) * day - offset;
  return { start: new Date(start).toISOString(), end: new Date(start + 7 * day).toISOString() };
}
export function eventsThisWeek<T extends { starts_at: string }>(events: T[], now = new Date()) {
  const week = currentWeek(now);
  return events.filter(event => Date.parse(event.starts_at) >= Date.parse(week.start) && Date.parse(event.starts_at) < Date.parse(week.end));
}
export async function dashboardSummary(user: LoginUser, now = new Date()) {
  await ensureDemoRepository(user);
  const [documents, allEvents, members] = await Promise.all([localDocuments(user.id), localEvents(user.id), localMemberOverview(user.id)]);
  let drive_warning: string | undefined;
  if (await googleSession(user.id)) { try { documents.push(...(await driveDocuments(user)).map(item => ({ ...item, storage_path: "" }))); } catch { drive_warning = "Drive could not be refreshed; document counts currently include local files only."; } }
  const events = eventsThisWeek(allEvents, now);
  const upcoming = events.filter(event => Date.parse(event.starts_at) >= now.getTime());
  const own = documents.filter(document => document.owner_id === user.id);
  return {
    drive_warning, user_name: user.user_name || "Your family", week: currentWeek(now), generated_at: now.toISOString(),
    counts: {
      pending: upcoming.length,
      appointments: upcoming.filter(event => /\b(appointment|blood|lab|test|scan)\b/i.test(event.title)).length,
      tests: upcoming.filter(event => /\b(blood|lab|test|scan|ct|cbc)\b/i.test(event.title)).length,
      replenishments: upcoming.filter(event => /\b(order medicines|replenish|refill)\b/i.test(event.title)).length,
      documents: own.length, uploads: own.filter(document => !document.demo).length, samples: own.filter(document => document.demo).length,
      shared_documents: documents.length - own.length,
      invitations_received: members.incoming.filter(member => member.status === "pending_acceptance").length,
      invitations_sent: members.outgoing.filter(member => member.status === "pending_acceptance").length,
      signatures_pending: members.outgoing.filter(member => member.status === "pending_signature").length,
    },
    events: events.map(({ id, title, description, starts_at }) => ({ id, title, description, starts_at, upcoming: Date.parse(starts_at) >= now.getTime() })),
  };
}
