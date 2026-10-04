import { hostedStorage, hostedFile, readHostedState, writeHostedState, retryState } from "./hosted-store";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { demoSamples, demoTaskTemplates } from "./demo-samples";
import { ApiError } from "./prototype-auth";
import { sharingConsent } from "../documents";

export type LocalDocument = { id: string; owner_id: string; owner_name: string; patient_name: string; document_type: string; doctor_name: string; city: string | null; document_date: string; filename: string; original_filename: string; repository_path: string; mime_type: string; size_bytes: number; created_at: string; storage_path: string; demo?: boolean };
export type LocalEvent = { id: string; owner_id: string; title: string; description: string; starts_at: string; created_at: string; url?: string; demo?: boolean; calendar_status?: "synced" | "failed"; google_event_id?: string };
export type LocalMember = { id: string; email: string; member_name?: string; status: "pending_signature" | "pending_acceptance" | "active" | "revoked"; created_at: string; consent_method?: "prototype" | "setu_esign"; consent_text?: string; signature_request_id?: string; signing_url?: string; signed_at?: string; revoked_at?: string; invitation_email_status?: string; revocation_email_status?: string };
type Store = { documents: LocalDocument[]; events: LocalEvent[]; seeded_users: string[]; members: Record<string, LocalMember[]>; left_shared: string[]; demo_versions: Record<string, number>; accounts: Record<string, { email: string; name: string }> };
const root = process.env.HEALTHNEST_LOCAL_DATA_DIR || path.join(process.cwd(), ".data");
const dbFile = path.join(root, "healthnest-local.json");
const globalQueues = globalThis as typeof globalThis & { __sarathiStoreQueues?: Map<string, Promise<unknown>> };
const queues = globalQueues.__sarathiStoreQueues ??= new Map();
async function read(): Promise<Store> {
  if (hostedStorage()) return readHostedState<Store>("repository", { documents: [], events: [], seeded_users: [], members: {}, left_shared: [], demo_versions: {}, accounts: {} });
  try { const value = JSON.parse(await readFile(dbFile, "utf8")); return { documents: value.documents || [], events: value.events || [], seeded_users: value.seeded_users || [], members: value.members || {}, left_shared: value.left_shared || [], demo_versions: value.demo_versions || {}, accounts: value.accounts || {} }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { documents: [], events: [], seeded_users: [], members: {}, left_shared: [], demo_versions: {}, accounts: {} }; throw error; }
}
async function write(store: Store) { if (hostedStorage()) return writeHostedState("repository", store); await mkdir(root, { recursive: true }); const temporary = `${dbFile}.${randomUUID()}.tmp`; await writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 }); await rename(temporary, dbFile); }
function serial<T>(fn: () => Promise<T>) { const task = (queues.get(dbFile) || Promise.resolve()).then(() => hostedStorage() ? retryState(fn) : fn()); queues.set(dbFile, task.catch(() => undefined)); return task; }
function nextDay(date: string) { const value = new Date(`${date}T09:00:00+05:30`); value.setDate(value.getDate() + 1); return value.toISOString(); }
function upcomingDemoDay(days: number) { const value = new Date(); value.setDate(value.getDate() + days); value.setHours(9, 0, 0, 0); return value.toISOString(); }
function demoText(patient: string, item: typeof demoSamples[number], shared: boolean) {
  const note = shared ? item.note.replaceAll("Age: 42", "Age: 67").replaceAll("Sex: Female", "Sex: Male").replace("11.2 g/dL", "12.6 g/dL").replace("218 mg/dL", "192 mg/dL").replace("109 mg/dL", "118 mg/dL") : item.note;
  return `SARATHI PROTOTYPE — FICTIONAL DEMO RECORD

Patient: ${patient}
Clinician: ${item.doctor}
City: ${item.city}
Document type: ${item.type}
Study: ${item.label}
Record date: ${item.date}

${note}

Synthetic patient, clinician and observations for demonstration only. Not a real medical record or a care recommendation.`;
}
async function createDemoDocument(ownerId: string, ownerName: string, patient: string, item: typeof demoSamples[number]): Promise<LocalDocument> {
  const { type: kind, doctor, city, date } = item; const filename = `${kind.replace(/ /g, "_")}_${doctor.replace(/^Dr\. /, "").replace(/ /g, "_")}_${date}.txt`;
  const id = `demo-${randomUUID()}`; const relative = path.join("demo", ownerId, `${id}.txt`); const full = path.join(root, relative);
  const contents = demoText(patient, item, ownerId.startsWith("demo-family-")); if (hostedStorage()) await hostedFile(relative, Buffer.from(contents), "text/plain"); else { await mkdir(path.dirname(full), { recursive: true }); await writeFile(full, contents, { mode: 0o600 }); }
  return { id, owner_id: ownerId, owner_name: ownerName, patient_name: patient, document_type: kind, doctor_name: doctor, city, document_date: date, filename, original_filename: filename, repository_path: `${patient}/${date.slice(0, 4)}/${kind}/${filename}`, mime_type: "text/plain", size_bytes: Buffer.byteLength(contents), created_at: new Date(`${date}T12:00:00Z`).toISOString(), storage_path: relative, demo: true };
}
export async function ensureDemoRepository(user: { id: string; user_name?: string | null; email?: string }) {
  await serial(async () => {
    const store = await read();
    // Previous local demo entries explicitly granted no real access. Require new signed consent.
    for (const list of Object.values(store.members)) for (const member of list) if (!member.consent_method && member.status !== "revoked") {
      member.status = "pending_signature"; member.consent_method = "setu_esign"; member.consent_text = sharingConsent(member.email);
    }
    if (user.email) store.accounts[user.id] = { email: user.email.trim().toLowerCase(), name: user.user_name?.trim() || "Family member" };
    if (store.demo_versions[user.id] === 4) { await write(store); return; }
    const demoOwners = [user.id, `demo-family-${user.id}`];
    store.documents = store.documents.filter(doc => !(doc.demo && demoOwners.includes(doc.owner_id)));
    store.events = store.events.filter(event => !(event.demo && demoOwners.includes(event.owner_id)));
    for (const event of store.events.filter(event => event.owner_id === user.id && event.title.startsWith("Review uploaded "))) {
      event.title = event.title.replace("Review uploaded Prescription", "Order medicines").replace("Review uploaded Medical Report", "Blood test");
      event.description = "Migrated local prototype care task. No order, clinical instruction, provider booking, or Google Calendar sync occurred. Provider/lab name: [to be confirmed].";
    }
    const ownPatient = user.user_name?.trim() || "You";
    const samples = [demoSamples[0], demoSamples.find(item => item.type === "Prescription")!];
    const ownItems = samples.map(async (item, index) => createDemoDocument(user.id, ownPatient, ownPatient, item).then(doc => ({ doc, index })));
    const sharedId = `demo-family-${user.id}`; const sharedOwner = "Ananya Rao"; const sharedPatient = "Rohan Rao";
    const sharedItems = samples.map(async (item, index) => createDemoDocument(sharedId, sharedOwner, sharedPatient, item).then(doc => ({ doc, index })));
    const [own, shared] = await Promise.all([Promise.all(ownItems), Promise.all(sharedItems)]);
    store.documents.push(...own.map(item => item.doc), ...shared.map(item => item.doc));
    for (const [ownerId, patient] of [[user.id, ownPatient], [sharedId, sharedPatient]]) {
      demoTaskTemplates.forEach((template, index) => store.events.push({ id: randomUUID(), owner_id: ownerId, title: `${template.title} · ${patient}`, description: template.description, starts_at: upcomingDemoDay(index + 1), created_at: new Date().toISOString(), demo: true }));
    }
    if (!store.seeded_users.includes(user.id)) store.seeded_users.push(user.id);
    store.demo_versions[user.id] = 4; store.members[user.id] = store.members[user.id] || [];
    await write(store);
  });
}
export async function saveLocalDocument(input: Omit<LocalDocument, "storage_path" | "id" | "created_at">, bytes: Buffer, ext = "") {
  const id = randomUUID(); const relative = path.join("uploads", input.owner_id, `${id}${ext}`); const full = path.join(root, relative);
  if (hostedStorage()) await hostedFile(relative, bytes, input.mime_type); else { await mkdir(path.dirname(full), { recursive: true }); await writeFile(full, bytes, { mode: 0o600 }); }
  const document: LocalDocument = { ...input, id, created_at: new Date().toISOString(), storage_path: relative };
  try { await serial(async () => { const store = await read(); store.documents.push(document); await write(store); }); }
  catch (error) { if (!hostedStorage()) await import("node:fs/promises").then(fs => fs.rm(full, { force: true })); throw error; }
  return document;
}
export async function scheduleDocumentReview(ownerId: string, patient: string, type: string, doctor: string, date: string) {
  if (!(["Medical Report", "Prescription"] as string[]).includes(type)) return null;
  return serial(async () => { const store = await read(); const event: LocalEvent = { id: randomUUID(), owner_id: ownerId, title: `${type === "Prescription" ? "Order medicines" : "Blood test"} · ${patient}`, description: `A ${type.toLowerCase()} was added to your Sarathi library on ${date}${doctor ? ` by ${doctor}` : ""}. ${type === "Prescription" ? "Demo order task only: confirm the prescription before purchasing; no order was placed." : "Demo blood-test task only. Lab name: [to be confirmed]. No test order or preparation advice is inferred."}`, starts_at: Date.parse(nextDay(date)) > Date.now() ? nextDay(date) : upcomingDemoDay(1), created_at: new Date().toISOString() }; store.events.push(event); await write(store); return event; });
}
function permittedOwners(store: Store, userId: string) {
  const owners = [userId];
  if (!store.left_shared.includes(userId)) owners.push(`demo-family-${userId}`);
  const email = store.accounts[userId]?.email;
  if (email) for (const [ownerId, grants] of Object.entries(store.members)) if (grants.some(grant => grant.email === email && grant.status === "active")) owners.push(ownerId);
  return owners;
}
export async function localAccessibleOwners(userId: string) { return permittedOwners(await read(), userId); }
export async function localDocuments(userId: string) { const store = await read(); const owners = permittedOwners(store, userId); return store.documents.filter(item => owners.includes(item.owner_id)); }
export async function getLocalDocument(userId: string, id: string) { const doc = (await localDocuments(userId)).find(item => item.id === id); if (!doc) throw new ApiError("Document not found or access has been revoked.", 404); return doc; }
export function localFilePath(storagePath: string) { const base = path.resolve(root); const target = path.resolve(base, storagePath); if (!target.startsWith(`${base}${path.sep}`)) throw new ApiError("Document not found.", 404); return target; }
export async function localEvents(userId: string) { const store = await read(); const owners = permittedOwners(store, userId); return store.events.filter(event => owners.includes(event.owner_id)).map(event => ({ ...event, description: event.description.replaceAll("HealthNest", "Sarathi") })).sort((a, b) => a.starts_at.localeCompare(b.starts_at)); }
export async function addLocalEvent(userId: string, event: Omit<LocalEvent, "id" | "owner_id" | "created_at">, stableId?: string) { return serial(async () => { const store = await read(); if (stableId) { const existing = store.events.find(item => item.id === stableId && item.owner_id === userId); if (existing) return existing; } const saved = { ...event, owner_id: userId, id: stableId || randomUUID(), created_at: new Date().toISOString() }; store.events.push(saved); await write(store); return saved; }); }
export async function patchLocalEvent(userId: string, id: string, values: Pick<LocalEvent, "url" | "calendar_status" | "google_event_id">) { return serial(async () => { const store = await read(); const event = store.events.find(item => item.id === id && item.owner_id === userId); if (!event) throw new ApiError("Choose one of your own care tasks.", 404); Object.assign(event, values); await write(store); return event; }); }
export async function localMemberOverview(userId: string) {
  const store = await read(); const email = store.accounts[userId]?.email;
  const incoming = store.left_shared.includes(userId) ? [] : [{ id: `demo-family-${userId}`, owner_name: "Ananya Rao", status: "active", created_at: new Date().toISOString() }];
  if (email) for (const [ownerId, list] of Object.entries(store.members)) for (const item of list) if (item.email === email && ["active", "pending_acceptance"].includes(item.status)) incoming.push({ id: item.id, owner_name: store.accounts[ownerId]?.name || "Family member", status: item.status, created_at: item.created_at });
  return { outgoing: (store.members[userId] || []).map(item => ({ ...item, recipient_email: item.email, consent_method: item.consent_method || "prototype", invitation_email_status: item.invitation_email_status || "not_sent", revocation_email_status: item.revocation_email_status || "not_sent", revoked_at: item.revoked_at || null })), incoming, google_connected: false, consent_mode: process.env.SHARING_CONSENT_MODE === "setu_esign" ? "setu_esign" : "local_demo" };
}
export async function localOwnedMember(userId: string, id: string) { const member = (await read()).members[userId]?.find(item => item.id === id); if (!member) throw new ApiError("Member access not found.", 404); return member; }
export async function patchLocalMember(userId: string, id: string, values: Partial<Pick<LocalMember, "signature_request_id" | "signing_url" | "signed_at" | "status" | "invitation_email_status" | "revocation_email_status">>) {
  return serial(async () => { const store = await read(); const member = store.members[userId]?.find(item => item.id === id); if (!member) throw new ApiError("Member access not found.", 404); if (member.status === "revoked" && Object.keys(values).some(key => !["invitation_email_status", "revocation_email_status"].includes(key))) throw new ApiError("Sharing was revoked. Start a new invitation.", 409); Object.assign(member, values); await write(store); return member; });
}
export async function localMemberAction(userId: string, action: string, idOrEmail: string, signedConsent = false, consentText = "", memberName = "") {
  return serial(async () => {
    const store = await read(); const list = store.members[userId] || [];
    if (action === "add") {
      const email = idOrEmail.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("Enter a valid email address.");
      if (email === store.accounts[userId]?.email) throw new ApiError("You already own this repository.");
      if (list.some(item => item.email === email && item.status !== "revoked")) throw new ApiError("This member already has active or pending access.", 409);
      const member: LocalMember = { member_name: memberName.trim().slice(0,100), id: randomUUID(), email, status: signedConsent ? "pending_signature" : "pending_acceptance", consent_method: signedConsent ? "setu_esign" : "prototype", consent_text: consentText, created_at: new Date().toISOString() };
      list.push(member); store.members[userId] = list; await write(store);
      return { grant: member, email_status: "not_sent", local_only: true, pending_signature: signedConsent };
    }
    if (action === "leave" && idOrEmail === `demo-family-${userId}`) { if (!store.left_shared.includes(userId)) store.left_shared.push(userId); await write(store); return { email_status: "not_sent", local_only: true }; }
    if (["accept", "decline", "leave"].includes(action)) {
      const email = store.accounts[userId]?.email;
      const received = Object.values(store.members).flat().find(item => item.id === idOrEmail && email && item.email === email);
      if (!received) throw new ApiError("Invitation not found.", 404);
      if (action === "accept" && received.status !== "pending_acceptance") throw new ApiError("This invitation is not ready for acceptance.", 409);
      if (action === "accept" && received.consent_method === "setu_esign" && !received.signed_at) throw new ApiError("Signed consent is required.", 409);
      received.status = action === "accept" ? "active" : "revoked";
      if (received.status === "revoked") received.revoked_at = new Date().toISOString();
      await write(store); return { email_status: "not_sent", local_only: true };
    }
    const member = list.find(item => item.id === idOrEmail); if (!member) throw new ApiError("Member access not found.", 404);
    member.status = "revoked"; member.revoked_at = new Date().toISOString(); await write(store); return { email_status: "not_sent", local_only: true };
  });
}
