// Local-only prototype integration checks. Uses an isolated temporary data folder.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const dataDirectory = path.join(os.tmpdir(), `healthnest-test-${randomUUID()}`);
process.env.HEALTHNEST_LOCAL_DATA_DIR = dataDirectory;
process.env.NODE_ENV = "test";
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith("@/") ? path.join(process.cwd(), "src", request.slice(2)) : request, ...args); };
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(require("node:fs").readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);

async function main() {
  const docs = require("../src/lib/server/document-service.ts");
  const local = require("../src/lib/server/local-health-data.ts");
  const calendar = require("../src/lib/server/calendar-service.ts");
  const user = { id: randomUUID(), user_name: "Demo Owner", mobile_number: "+919876543210", email: "demo@example.com", created_at: new Date().toISOString() };
  const initial = await docs.documentSummary(user);
  assert.equal(initial.storage, "local");
  assert.equal(initial.summary.length, 2, "owner and incoming demo repository should be visible");
  assert.equal(initial.summary[0].counts["Medical Report"], 1);
  assert.equal(initial.summary[0].counts.Prescription, 1);
  assert.equal(initial.summary[1].name, "Ananya Rao");
  assert.equal(initial.summary[1].counts["Medical Report"], 1);
  assert.equal(initial.summary[1].counts.Prescription, 1);
  const demoFile = await docs.localDocumentFile(user, initial.documents[0].id);
  assert.match(demoFile.bytes.toString(), /FICTIONAL DEMO RECORD/);

  const form = new FormData();
  form.set("file", new File(["Local test report"], "report.pdf", { type: "application/pdf" }));
  for (const [key, value] of Object.entries({ document_type: "Medical Report", patient_choice: "me", doctor_name: "Dr Test Clinician", document_date: new Date().toISOString().slice(0, 10), city: "Bengaluru" })) form.set(key, value);
  const uploaded = await docs.uploadDocument(user, form);
  assert.match(uploaded.repository_path, /^Demo Owner\/\d{4}\/Medical Report\//);
  assert.ok(uploaded.calendar_event, "Medical report upload schedules a local task");
  const saved = await docs.documentSummary(user);
  assert.equal(saved.documents.length, 5);
  const uploadedFile = await docs.localDocumentFile(user, uploaded.id);
  assert.equal(uploadedFile.bytes.toString(), "Local test report");
  const upcoming = await calendar.upcomingCalendarTasks(user);
  assert.ok(upcoming.some(task => task.title === uploaded.calendar_event.title));

  const booking = require("../src/lib/server/demo-booking.ts");
  for (const [input, title] of [["can you book an appointment", "Follow-up appointment"], ["schedule a CT scan", "CT scan appointment"], ["arrange a blood test", "Blood test"], ["book a lab test", "Lab test"], ["order my medicines", "Order medicines"]]) {
    const result = await booking.createDemoBooking(user, input);
    assert.equal(result.event.title, title);
    assert.equal(result.event.owner_id, user.id);
    assert.match(result.result.reply, /No clinic booking, purchase, or Google Calendar sync/);
    assert.equal((await booking.createDemoBooking(user, input)).event.id, result.event.id, "retry must not create duplicate task");
  }
  for (const input of ["show my appointments", "do not book an appointment", "how do I book a lab test", "delete my appointment"]) assert.equal(booking.bookingTemplate(input), null);
  const before = (await local.localDocuments(user.id)).length;
  await local.ensureDemoRepository(user);
  assert.equal((await local.localDocuments(user.id)).length, before, "seed migration is idempotent and retains uploads");
  const taskTitles = (await local.localEvents(user.id)).map(task => task.title);
  for (const title of ["Order medicines", "Lab test", "Blood test", "CT scan appointment", "Follow-up appointment"]) assert.ok(taskTitles.some(task => task.startsWith(title)));
  const flow = require("../src/lib/server/booking-flow.ts");
  const traceForFlow = require("../src/lib/server/agent-run-log.ts");
  const address = { rawAddress: "Building 1, Bengaluru 560001", formattedAddress: "Building 1, Bengaluru 560001", components: {}, validation: { quality: "ok", missingFields: [], reason: "Demo", confidence: "medium" }, location: { lat: 12.97, lng: 77.59 }, source: "demo", confirmedAt: new Date().toISOString() };
  await flow.rememberVerifiedLabs(user.id, { ranked: [{ id: "lab-1", name: "Demo Lakeview Lab", address, distanceKilometers: 1 }], unverified: [], source: "demo", rationale: "Demo" });
  await assert.rejects(() => flow.selectVerifiedLab("other-user", "lab-1"), /Fetch verified labs/);
  await flow.selectVerifiedLab(user.id, "lab-1");
  const begun = await flow.beginVoiceBooking(user, "book a blood test with Demo Lakeview Lab", traceForFlow.newAgentRunId(user.id));
  assert.ok(begun.action.path.startsWith("/voice?booking="));
  const beforeBooking = (await local.localEvents(user.id)).length;
  await assert.rejects(() => flow.bookingSetup("other-user", begun.booking_id), /expired or is unavailable/);
  assert.equal((await flow.bookingSetup(user.id, begun.booking_id)).lab_name, "Demo Lakeview Lab");
  const simulated = { call: { id: "demo-call", useCase: "lab_inquiry", status: "completed", startedAt: new Date().toISOString() }, turns: [], activity: [], result: { available: true, testName: "Complete blood count", earliestSlot: "tomorrow at 9:30 AM", needsConfirmation: [] } };
  let simulations = 0;
  const simulate = async () => { simulations++; await new Promise(resolve => setTimeout(resolve, 10)); return simulated; };
  const [finished, repeated] = await Promise.all([flow.completeVoiceBooking(user, begun.booking_id, simulate), flow.completeVoiceBooking(user, begun.booking_id, simulate)]);
  assert.equal(simulations, 1, "concurrent UI requests run Gnani only once");
  assert.equal(finished.booking.event_id, repeated.booking.event_id);
  assert.equal((await local.localEvents(user.id)).length, beforeBooking + 1, "task is saved only after simulation succeeds");
  assert.match(finished.booking.reply, /Demo booking done successfully/);
  assert.match(finished.booking.reply, /local care calendar/);
  assert.equal((await flow.completeVoiceBooking(user, begun.booking_id, simulate)).booking.event_id, finished.booking.event_id);
  assert.equal(simulations, 1, "reload returns completed booking without another provider call");
  assert.equal((await flow.beginVoiceBooking(user, "book a test with Unknown Lab", traceForFlow.newAgentRunId(user.id))).action.path, "/location?focus=labs");
  const failed = await flow.beginVoiceBooking(user, "book a CT scan", traceForFlow.newAgentRunId(user.id));
  await assert.rejects(() => flow.completeVoiceBooking(user, failed.booking_id, async () => ({ ...simulated, result: { ...simulated.result, available: false } })), /No booking task was added/);
  assert.equal((await local.localEvents(user.id)).length, beforeBooking + 1, "unavailable simulation cannot create tasks");
  await assert.rejects(() => flow.completeVoiceBooking(user, failed.booking_id, async () => { throw new Error("provider failed"); }), /provider failed/);
  assert.equal((await local.localEvents(user.id)).length, beforeBooking + 1);
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ transcript: "Synthetic reply", token: "must-not-be-logged" }), { headers: { "Content-Type": "application/json" } });
  try {
    const trace = require("../src/lib/server/agent-run-log.ts");
    const { tracedPartnerFetch } = require("../src/lib/server/partner-trace.ts");
    const run = trace.newAgentRunId(user.id);
    await tracedPartnerFetch(run, "Gnani", "https://example.invalid/test", { method: "POST", headers: { Authorization: "secret-header" }, body: JSON.stringify({ text: "Demo", api_key: "secret-body" }) });
    const events = (await trace.recentAgentEvents(user.id)).filter(event => event.run_id === run);
    assert.equal(events.length, 2); assert.equal(events[0].details.call_id, events[1].details.call_id);
    const serialized = JSON.stringify(events); assert.ok(!serialized.includes("secret-header") && !serialized.includes("secret-body") && !serialized.includes("must-not-be-logged"));
    assert.equal((await trace.recentAgentEvents("other-user")).length, 0);
    const output = require("../src/lib/server/evidence-export.ts").evidenceMarkdown(events);
    assert.match(output, /https:\/\/example.invalid\/test/);
    await trace.clearAgentEvents(user.id);
  } finally { global.fetch = originalFetch; }

  const members = await local.localMemberOverview(user.id);
  assert.equal(members.incoming[0].owner_name, "Ananya Rao");
  await local.localMemberAction(user.id, "add", "sample.member@example.com");
  assert.equal((await local.localMemberOverview(user.id)).outgoing[0].recipient_email, "sample.member@example.com");
  const recipient = { ...user, id: randomUUID(), email: "sample.member@example.com", user_name: "Demo Recipient" };
  await local.ensureDemoRepository(recipient);
  const invitation = (await local.localMemberOverview(recipient.id)).incoming.find(item => item.status === "pending_acceptance");
  assert.ok(invitation);
  assert.ok(!(await local.localDocuments(recipient.id)).some(item => item.owner_id === user.id), "pending invitation grants no access");
  await assert.rejects(() => local.localMemberAction("unrelated-user", "accept", invitation.id), /Invitation not found/);
  await local.localMemberAction(recipient.id, "accept", invitation.id);
  assert.ok((await local.localDocuments(recipient.id)).some(item => item.owner_id === user.id));
  assert.match((await docs.previewDocument(recipient, uploaded.id)).preview_url, /#toolbar=0/);
  await local.localMemberAction(user.id, "remove", invitation.id);
  assert.ok(!(await local.localDocuments(recipient.id)).some(item => item.owner_id === user.id), "revocation blocks access immediately");
  await assert.rejects(() => docs.previewDocument(recipient, uploaded.id), /access has been revoked/);
  const signedInvitation = await local.localMemberAction(user.id, "add", recipient.email, true, "Test signed sharing consent");
  const signedId = signedInvitation.grant.id;
  await assert.rejects(() => local.localMemberAction(recipient.id, "accept", signedId), /not ready/);
  process.env.SETU_CLIENT_ID = "test-client"; process.env.SETU_CLIENT_SECRET = "test-secret"; process.env.SETU_PRODUCT_INSTANCE_ID = "test-instance"; process.env.SETU_REDIRECT_URL = "https://example.com";
  const sharing = require("../src/lib/server/local-sharing.ts");
  const trace = require("../src/lib/server/agent-run-log.ts");
  const run = trace.newAgentRunId(user.id);
  let signed = false; let wrongId = false; const called = [];
  global.fetch = async (url, init) => {
    const endpoint = new URL(url).pathname; called.push(endpoint);
    if (endpoint === "/api/documents") { assert.ok(init.body instanceof FormData); return new Response(JSON.stringify({ id: "consent-document" })); }
    if (endpoint === "/api/signature") { const request = JSON.parse(init.body); assert.equal(request.documentId, "consent-document"); return new Response(JSON.stringify({ id: "test-signature", signers: [{ url: "https://dg-sandbox.setu.co/sign/test" }] })); }
    return new Response(JSON.stringify({ id: wrongId ? "other-signature" : "test-signature", status: signed ? "sign_complete" : "sign_initiated", signers: [{ identifier: user.mobile_number.slice(3), status: signed ? "signed" : "pending" }] }));
  };
  try {
    assert.equal((await sharing.finishLocalConsent(user, signedId, run)).pending_signature, true);
    assert.deepEqual(called.slice(0, 2), ["/api/documents", "/api/signature"]);
    await assert.rejects(() => sharing.finishLocalConsent(recipient, signedId, run), /Member access not found/);
    assert.equal((await sharing.finishLocalConsent(user, signedId, run)).pending_signature, true);
    signed = true; wrongId = true;
    assert.equal((await sharing.finishLocalConsent(user, signedId, run)).pending_signature, true, "mismatched response cannot grant consent");
    wrongId = false;
    assert.equal((await sharing.finishLocalConsent(user, signedId, run)).pending_signature, false);
    assert.equal((await local.localOwnedMember(user.id, signedId)).status, "pending_acceptance");
    assert.ok(!(await local.localDocuments(recipient.id)).some(item => item.owner_id === user.id));
    await local.localMemberAction(recipient.id, "accept", signedId);
    assert.ok((await local.localDocuments(recipient.id)).some(item => item.owner_id === user.id));
    await local.localMemberAction(user.id, "remove", signedId);
    await assert.rejects(() => sharing.finishLocalConsent(user, signedId, run), /revoked/);
  } finally { global.fetch = originalFetch; }
  const dashboard = require("../src/lib/server/dashboard-summary.ts");
  const fixed = new Date("2026-10-05T04:00:00Z");
  assert.deepEqual(dashboard.currentWeek(fixed), { start: "2026-10-04T18:30:00.000Z", end: "2026-10-11T18:30:00.000Z" });
  const boundary = dashboard.eventsThisWeek([{ starts_at: "2026-10-04T18:29:59Z" }, { starts_at: "2026-10-04T18:30:00Z" }, { starts_at: "2026-10-11T18:29:59Z" }, { starts_at: "2026-10-11T18:30:00Z" }], fixed);
  assert.equal(boundary.length, 2, "IST week includes Monday and Sunday, excludes adjacent weeks");
  const overview = await dashboard.dashboardSummary(user);
  assert.equal(overview.counts.documents, 3); assert.equal(overview.counts.uploads, 1); assert.equal(overview.counts.samples, 2);
  console.log("Local repository checks passed: uploads, preview access, seeded shared records, member demo list, upload-triggered tasks, semantic local bookings, seed idempotence, and isolated redacted partner traces.");
}
main().finally(() => fs.rm(dataDirectory, { recursive: true, force: true })).catch(error => { console.error(error); process.exitCode = 1; });
