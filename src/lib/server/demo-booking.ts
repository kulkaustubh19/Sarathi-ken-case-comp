import { addLocalEvent, ensureDemoRepository, localEvents } from "./local-health-data";
import type { LoginUser } from "./login-store";

export const localBookingRule = "On an explicit care booking request, create an owner-only static local task. Never claim a clinic booking, purchase, phone call, or Google Calendar sync occurred. Do not infer clinical necessity, dosages, or preparation instructions.";
export function bookingTemplate(message: string) {
  if (/\b(?:cancel|delete|remove|don't|do not|not now)\b/i.test(message) || /\b(?:how|do i have|show|view|list)\b/i.test(message)) return null;
  if (!/\b(?:book|schedule|arrange|reserve|set up|order)\b/i.test(message)) return null;
  const title = /\b(?:medicines?|medications?|pharmacy|tablets?)\b/i.test(message) ? "Order medicines"
    : /\b(?:ct|computed tomography)\b/i.test(message) ? "CT scan appointment"
    : /\bblood\b/i.test(message) ? "Blood test"
    : /\blab\b/i.test(message) ? "Lab test"
    : /\btests?\b/i.test(message) ? "Blood test"
    : /\b(?:appointment|appointme|follow.?up|doctor|consultation|visit)\b/i.test(message) ? "Follow-up appointment" : null;
  if (!title) return null;
  const date = new Date(); date.setDate(date.getDate() + (/\bnext week\b/i.test(message) ? 7 : 1));
  // Demo default: tomorrow 09:30 India time. Explicit dates/times are not silently interpreted.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const starts_at = new Date(`${day}T09:30:00+05:30`).toISOString();
  const location = /test/.test(title) ? "Lab name: [to be confirmed]." : /CT/.test(title) ? "Imaging centre: [to be confirmed]." : /Order/.test(title) ? "Pharmacy: [to be confirmed]." : "Doctor/clinic: [to be confirmed].";
  return { title, starts_at, description: `Static prototype task. ${location} No provider appointment, medicine purchase, or Google Calendar event has been created. Confirm all clinical instructions with the provider.`, demo: false };
}
export async function createDemoBooking(user: LoginUser, message: string) {
  const template = bookingTemplate(message); if (!template) return null;
  await ensureDemoRepository(user);
  // Repeated clicks within a minute return the same task rather than create duplicate reminders.
  const existing = (await localEvents(user.id)).find(event => event.owner_id === user.id && event.title === template.title && event.starts_at === template.starts_at && event.description === template.description && Date.now() - Date.parse(event.created_at) < 60000);
  const event = existing || await addLocalEvent(user.id, template);
  const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(event.starts_at));
  return { event, result: { reply: `${existing ? "Your existing" : "Added a"} local demo task: ${event.title}, ${when} IST (static template time). No clinic booking, purchase, or Google Calendar sync has occurred. I’ll open Tasks; voice inquiries are available separately.`, action: { type: "navigate", path: "/tasks", label: "View task" }, local_only: true, event_id: event.id } };
}
