import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:8080";
const phone = process.env.TEST_PHONE;
if (!phone) throw new Error("Provide TEST_PHONE for an existing prototype account.");
const jar = new Map();
async function call(path, body, expected = 200, origin = base) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Origin: origin, "Content-Type": "application/json", Cookie: [...jar].map(([key, value]) => key + "=" + value).join("; ") }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
  assert.equal(response.status, expected, "Unexpected status for " + path);
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : null;
}
for (const path of ["/documents", "/members", "/tasks", "/voice", "/location", "/address-book"]) await call(path);
for (const path of ["/api/dashboard", "/api/documents", "/api/profile", "/api/calendar/tasks", "/api/members", "/api/twilio/calls/missing"]) await call(path, undefined, 401);
for (const path of ["/api/gnani/demo", "/api/twilio/start", "/api/delhivery/address", "/api/delhivery/labs"]) await call(path, {}, 401);
const challenge = await call("/api/auth", { action: "request-otp", mode: "login", phone, storage_consent: true });
await call("/api/auth", { action: "verify-otp", otp: challenge.otp });
assert.ok((await call("/api/profile")).user);
const dashboard = await call("/api/dashboard");
assert.ok(dashboard.counts.samples === 2);
assert.ok(dashboard.events.every(event => Date.parse(event.starts_at) >= Date.parse(dashboard.week.start) && Date.parse(event.starts_at) < Date.parse(dashboard.week.end)));
assert.ok(Array.isArray((await call("/api/documents")).documents));
assert.ok(Array.isArray((await call("/api/calendar/tasks")).tasks));
assert.ok(Array.isArray((await call("/api/members")).incoming));
for (const path of ["/api/gnani/demo", "/api/twilio/start", "/api/delhivery/address", "/api/delhivery/labs"]) await call(path, {}, 400);
await call("/api/delhivery/address", {}, 403, "https://untrusted.example");
await call("/api/twilio/calls/missing", undefined, 404);
for (const [message, path] of [["open voice inquiries", "/voice"], ["validate my address", "/location"], ["show my address book", "/address-book"], ["show my documents", "/documents"], ["add a family member", "/members?focus=add"], ["show my reminders", "/tasks"], ["I want to upload my report", "/documents?tab=upload"], ["what's my status today", "/"]]) {
  const reply = await call("/api/chat", { message });
  assert.equal(reply.action?.path, path, "Unexpected chat destination for " + message);
}
const member = await call("/api/chat", { message: "Demo Person", member_intent: "add_member" });
assert.equal(member.action.path, "/members?focus=add&member_name=Demo%20Person");
const statusReply = await call("/api/chat", { message: "show my overview" });
assert.ok(statusReply.tiles.length >= 2);
const location = await call("/api/chat", { message: "find out labs for blood test near me" });
assert.equal(location.action.path, "/location?focus=labs");
const initialTasks = await call("/api/calendar/tasks");
const scheduled = await call("/api/chat", { message: "Please book a blood test" });
assert.ok(scheduled.booking_id);
assert.ok(scheduled.action.path.startsWith("/voice?booking="));
const setup = await call("/api/booking?id=" + scheduled.booking_id);
assert.equal(setup.input.useCase, "lab_inquiry");
const localTasks = await call("/api/calendar/tasks");
assert.equal(localTasks.tasks.length, initialTasks.tasks.length, "chat stages a booking without saving a task before voice completes");
const trace = await call("/api/activity");
assert.ok(trace.events.every(event => event.user_id === trace.events[0].user_id));
const repository = await call("/api/documents");
assert.equal(repository.summary[1].counts["Medical Report"], 1);
assert.equal(repository.summary[1].counts.Prescription, 1);
await call("/api/auth", { action: "logout" });
console.log("Merged-flow smoke checks passed: login, repository, members, reminders, new screens, API authorization, chat navigation, staged voice-booking navigation, varied shared records, and owner-only activity. No provider call was started.");

