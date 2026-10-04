import { hostedStorage, readHostedState, writeHostedState, retryState } from "./hosted-store";
import { syncGoogleEvent } from "./google-calendar";
import { randomUUID } from "node:crypto";
import type { LabCandidate, LabRecommendation } from "@/lib/types";
import type { VoiceDemoInput, VoiceDemoResult } from "@/rails/gnani/demo";
import { ApiError } from "./prototype-auth";
import { bookingTemplate } from "./demo-booking";
import { addLocalEvent, ensureDemoRepository, type LocalEvent } from "./local-health-data";
import { logAgentEvent } from "./agent-run-log";
import type { LoginUser } from "./login-store";

const ttl = 10 * 60 * 1000;
type LabSession = { labs: LabCandidate[]; selected?: string; expires: number };
type Completed = VoiceDemoResult & { booking: { id: string; event_id: string; reply: string; local_only: boolean; user_id: string; lab_name?: string } };
type Booking = { id: string; userId: string; runId: string; input: VoiceDemoInput; template: ReturnType<typeof bookingTemplate> & {}; lab?: LabCandidate; expires: number; result?: Completed; work?: Promise<Completed> };
const globalStore = globalThis as typeof globalThis & { __healthnestBookings?: { labs: Map<string, LabSession>; bookings: Map<string, Booking> } };
const state = globalStore.__healthnestBookings ??= { labs: new Map<string, LabSession>(), bookings: new Map<string, Booking>() };
function prune() { const now = Date.now(); for (const [id, item] of state.labs) if (item.expires <= now) state.labs.delete(id); for (const [id, item] of state.bookings) if (item.expires <= now && !item.work) state.bookings.delete(id); }
async function saveRemote(key: string, value: object, expires: number) { if (!hostedStorage()) return; await retryState(async () => { const saved = await readHostedState(key, {}); Object.assign(saved, value); await writeHostedState(key, saved, new Date(expires).toISOString()); }); }
async function loadRemoteBooking(userId: string, id: string) { if (hostedStorage()) { const saved = await readHostedState<Partial<Booking>>(`booking:${id}`, {}); if (saved.userId === userId && saved.expires && saved.expires > Date.now()) { const current = state.bookings.get(id); if (!current?.work) state.bookings.set(id, saved as Booking); } } }
async function loadRemoteLabs(userId: string) { if (hostedStorage()) { const saved = await readHostedState<Partial<LabSession>>(`labs:${userId}`, {}); if (saved.expires && saved.expires > Date.now()) state.labs.set(userId, saved as LabSession); } }
export async function rememberVerifiedLabs(userId: string, result: LabRecommendation) { prune(); const session = { labs: result.ranked, expires: Date.now() + ttl }; state.labs.set(userId, session); await saveRemote(`labs:${userId}`, session, session.expires); }
export async function selectVerifiedLab(userId: string, id: string) {
  await loadRemoteLabs(userId);
  prune(); const session = state.labs.get(userId); const lab = session?.labs.find(item => item.id === id);
  if (!session || !lab) throw new ApiError("Fetch verified labs again, then choose an accepted lab address.", 409);
  session.selected = id; await saveRemote(`labs:${userId}`, session, session.expires); return lab;
}
export const voiceBookingRule = "For an explicit prototype booking, open Voice inquiries and run only the in-app Gnani simulation. Save a local care-calendar task only after the simulation confirms availability and the template slot. Never claim a real provider reservation or purchase. Claim Google Calendar sync only after a successful authenticated Calendar API response.";
export async function beginVoiceBooking(user: LoginUser, message: string, runId: string) {
  await loadRemoteLabs(user.id);
  const template = bookingTemplate(message); if (!template) return null;
  prune(); const session = state.labs.get(user.id);
  const wantedLab = /\b(?:lab|test|blood)\b/i.test(message) ? message.match(/\b(?:with|at)\s+(.+?)(?:[.!?]|$)/i)?.[1]?.trim() : undefined;
  const matching = wantedLab ? session?.labs.filter(lab => (lab.name.toLocaleLowerCase() === wantedLab.toLocaleLowerCase() || wantedLab.toLocaleLowerCase().startsWith(lab.name.toLocaleLowerCase() + " "))) : [];
  let lab = matching?.length === 1 ? matching[0] : session?.labs.find(item => item.id === session.selected);
  if (wantedLab && matching?.length !== 1) return { reply: `I couldn’t match that lab to your current verified list. Open Location Intelligence, fetch verified labs, then select the lab you want to book.`, action: { type: "navigate", path: "/location?focus=labs", label: "Choose verified lab" } };
  if (template.title === "Order medicines") lab = undefined;
  const input: VoiceDemoInput = template.title === "Order medicines" ? { useCase: "pharmacy_inquiry", medicineName: "prescribed medicines" }
    : { useCase: "lab_inquiry", testName: template.title === "Blood test" ? "Complete blood count" : template.title === "Lab test" ? "Lipid profile" : template.title };
  const id = randomUUID(); const booking: Booking = { id, userId: user.id, runId, input, template, lab, expires: Date.now() + ttl };
  state.bookings.set(id, booking); await saveRemote(`booking:${id}`, booking, booking.expires);
  return { reply: `I’ll open Voice inquiries and start the in-app simulation${lab ? ` with ${lab.name}` : ""}. Once the simulated response confirms availability, I’ll add your booking to the local care calendar.`, booking_id: id, action: { type: "navigate", path: `/voice?booking=${encodeURIComponent(id)}`, label: "Run booking simulation" } };
}
export async function bookingSetup(userId: string, id: string) {
  await loadRemoteBooking(userId, id);
  prune(); const flow = state.bookings.get(id);
  if (!flow || flow.userId !== userId) throw new ApiError("Booking request expired or is unavailable. Ask Sarathi to book again.", 404);
  return { id: flow.id, input: flow.input, lab_name: flow.lab?.name, title: flow.template.title };
}
export async function completeVoiceBooking(user: LoginUser, id: string, simulate: (input: VoiceDemoInput, runId: string) => Promise<VoiceDemoResult>): Promise<Completed> {
  await bookingSetup(user.id, id); const flow = state.bookings.get(id)!;
  if (flow.result) return flow.result;
  if (flow.work) return flow.work;
  const work = (async () => {
    const result = await simulate(flow.input, flow.runId);
    const needsSlot = flow.input.useCase === "lab_inquiry";
    if (!result.result.available || (needsSlot && (!("earliestSlot" in result.result) || !result.result.earliestSlot || !/tomorrow\s+(?:at\s+)?(?:9[:.]30|nine[ -]thirty)\s*(?:a\.?m\.?|in the morning)/i.test(result.result.earliestSlot)))) {
      await logAgentEvent(flow.runId, "decision", { input: result.result, decided: "Do not create booking", why: "Availability and the supported static slot must be confirmed before a demo task is saved.", through: "Sarathi voice", to: "Signed-in user" });
      throw new ApiError("The simulation did not confirm availability at the demo slot. No booking task was added. Retry the simulation.", 409);
    }
    // Simulated slots are tomorrow 09:30 IST; do not silently use a different requested date.
    const tomorrow = bookingTemplate(flow.template.title === "Order medicines" ? "order medicines" : `book ${flow.template.title}`)!;
    await ensureDemoRepository(user);
    const event: LocalEvent = await addLocalEvent(user.id, { ...tomorrow, title: `${flow.template.title}${flow.lab ? ` · ${flow.lab.name}` : ""}`, description: `Demo booking completed through an in-app scripted Gnani inquiry. ${flow.lab ? `Lab: ${flow.lab.name}. Address: ${flow.lab.address.formattedAddress}.` : "Provider: demo operator."} This is a local care-calendar task; no real provider reservation or purchase occurred.` }, id);
    const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(event.starts_at));
    const calendar = await syncGoogleEvent(user.id, event);
    const reply = `Demo booking done successfully! ${event.title} is added to your local care calendar (Care Tasks) for ${when} IST, for your quick check. ${calendar.synced ? "Also synced to your Google Calendar." : calendar.warning} This prototype does not reserve a real provider slot.`;
    // Cache before logging so a trace write failure cannot cause a duplicate booking on retry.
    flow.result = { ...result, booking: { id, event_id: event.id, reply, local_only: !calendar.synced, user_id: user.id, lab_name: flow.lab?.name } };
    const { work: _work, ...persisted } = flow; void _work; await saveRemote(`booking:${id}`, persisted, flow.expires);
    await logAgentEvent(flow.runId, "decision", { input: result.result, decided: { event_id: event.id, title: event.title, starts_at: event.starts_at }, why: voiceBookingRule, through: "Local care calendar / Care Tasks", to: "Signed-in user", action: "addLocalEvent" });
    await logAgentEvent(flow.runId, "message_sent", { channel: "Sarathi chat", to: "Signed-in user", message: reply });
    return flow.result;
  })();
  flow.work = work;
  try { return await work; } finally { flow.work = undefined; }
}
