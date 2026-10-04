import { hostedStorage } from "./hosted-store";
import { db, eq } from "./database";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const keepForMs = 2 * 60 * 60 * 1000;
const file = path.join(process.env.HEALTHNEST_LOCAL_DATA_DIR || path.join(process.cwd(), ".data"), "agent-run-events.json");
type Event = { id: string; run_id: string; user_id: string | null; created_at: string; expires_at: string; type: string; details: Record<string, unknown> };
let queue: Promise<unknown> = Promise.resolve();
let cleanupTimer: NodeJS.Timeout | undefined;

function safeText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[PHONE/ID]")
    .replace(/\b(?:patient|member|user|doctor|physician|dr\.?)\s*name\s*[:\-]?\s*[^\n,;|]{2,100}/gi, "[PERSON REDACTED]")
    .replace(/\b(?:patient|member|user|doctor|physician|clinician)\s*[:=\-]\s*[^\n,;|]{2,100}/gi, "[PERSON REDACTED]")
    .replace(/\b(?:look at|view|show(?: me)?|open|find|check|see|access)\s+(?:the\s+)?[\p{L}\p{N}.'-]+(?:\s+[\p{L}\p{N}.'-]+){0,3}\s+(?:medical\s+)?(?:records?|reports?|prescriptions?|documents?|lab tests?)\b/giu, "[PERSON] records request")
    .replace(/\b(?:blood|lab) test\s+(?:for|of)\s+[^\n,;|]+/gi, "[PERSON] lab-test task")
    .replace(/\b(?:date of birth|dob|birth date)\s*[:\-]?\s*[^\n,;|]{2,40}/gi, "[DOB REDACTED]");
}
function clean(value: unknown, key = ""): unknown {
  if (/authorization|secret|token|api[_-]?key|password|cookie|otp|mobile_number|patient_name|doctor_name|user_name|identifier|displayName|signing_url|downloadUrl|^url$/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return safeText(value).slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 40).map(item => clean(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).map(([childKey, child]) => [childKey, clean(child, childKey)]));
  return value;
}
async function readAll(): Promise<Event[]> {
  try { const data = JSON.parse(await readFile(file, "utf8")); return Array.isArray(data) ? data : []; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function save(events: Event[]) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(events, null, 2), { mode: 0o600 });
  await rename(temp, file);
}
function scheduleCleanup(events: Event[]) {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  const nextExpiry = events.reduce((soonest, event) => Math.min(soonest, Date.parse(event.expires_at)), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextExpiry)) { cleanupTimer = undefined; return; }
  cleanupTimer = setTimeout(() => { if (!hostedStorage()) void recentAgentEvents().catch(() => undefined); }, Math.max(0, nextExpiry - Date.now()));
  cleanupTimer.unref();
}
async function serialized<T>(action: () => Promise<T>) {
  const work = queue.then(action); queue = work.catch(() => undefined); return work;
}
export function newAgentRunId(userId?: string): string { return userId ? `${userId}:${randomUUID()}` : randomUUID(); }
export async function logAgentEvent(runId: string | undefined, type: string, details: Record<string, unknown>) {
  if (!runId) return;
  if (hostedStorage()) { const now = Date.now(); await db("sarathi_agent_events", "", { method: "POST", body: JSON.stringify({ id: randomUUID(), run_id: runId, user_id: runId.includes(":") ? runId.split(":", 1)[0] : null, created_at: new Date(now).toISOString(), expires_at: new Date(now + keepForMs).toISOString(), type, details: clean(details) }) }); return; }
  await serialized(async () => {
    const now = Date.now(); const events = (await readAll()).filter(event => Date.parse(event.expires_at) > now);
    events.push({ id: randomUUID(), run_id: runId, user_id: runId.includes(":") ? runId.split(":", 1)[0] : null, created_at: new Date(now).toISOString(), expires_at: new Date(now + keepForMs).toISOString(), type, details: clean(details) as Record<string, unknown> });
    const bounded = events.slice(-2000); await save(bounded); scheduleCleanup(bounded);
  });
}
export async function recentAgentEvents(userId?: string) {
  if (hostedStorage()) return db<Event>("sarathi_agent_events", `?expires_at=gt.${eq(new Date().toISOString())}${userId ? `&user_id=eq.${eq(userId)}` : ""}&order=created_at.asc&limit=2000`);
  return serialized(async () => {
    const now = Date.now(); const all = await readAll(); const active = all.filter(event => Date.parse(event.expires_at) > now);
    if (active.length !== all.length) await save(active);
    scheduleCleanup(active);
    return active.filter(event => !userId || event.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  });
}
export async function clearAgentEvents(userId?: string) { if (hostedStorage()) { await db("sarathi_agent_events", userId ? `?user_id=eq.${eq(userId)}` : "?id=not.is.null", { method: "DELETE" }); return; } await serialized(async () => { const events = await readAll(); const remaining = userId ? events.filter(event => event.user_id !== userId) : []; await save(remaining); scheduleCleanup(remaining); }); }

if (!hostedStorage()) void recentAgentEvents().catch(() => undefined);
