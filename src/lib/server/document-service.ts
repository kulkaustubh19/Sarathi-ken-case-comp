import { hostedStorage, hostedFile } from "./hosted-store";
import { googleSession } from "./google-drive";
import { driveDocumentFile, driveDocuments, uploadDriveDocument } from "./drive-documents";
import { syncGoogleEvent } from "./google-calendar";
import { readFile } from "node:fs/promises";
import { ApiError } from "./prototype-auth";
import { DOCUMENT_TYPES, documentPath, safeSegment } from "../documents";
import { ensureDemoRepository, getLocalDocument, localAccessibleOwners, localDocuments, localFilePath, saveLocalDocument, scheduleDocumentReview, type LocalDocument } from "./local-health-data";
import type { LoginUser } from "./login-store";

function publicDocument(row: LocalDocument) {
  const document = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "storage_path")) as Omit<LocalDocument, "storage_path">;
  return { ...document, drive_file_id: "", drive_url: `/api/documents/${encodeURIComponent(row.id)}/file` };
}
export async function accessibleOwners(user: LoginUser) { await ensureDemoRepository(user); return localAccessibleOwners(user.id); }
export async function documentSummary(user: LoginUser, storage = "auto") {
  await ensureDemoRepository(user);
  if (storage === "auto") storage = await googleSession(user.id) ? "both" : "local";
  const docs = storage === "drive" ? await driveDocuments(user) : (await localDocuments(user.id)).map(publicDocument);
  if (storage === "both") docs.push(...await driveDocuments(user));
  const owners = storage === "drive" ? [user.id] : await localAccessibleOwners(user.id);
  const summary = owners.map(ownerId => {
    const records = docs.filter(document => document.owner_id === ownerId);
    const ownerName = ownerId === user.id ? user.user_name || "You" : records[0]?.owner_name || "Family member";
    const counts = Object.fromEntries(DOCUMENT_TYPES.map(type => [type, records.filter(record => record.document_type === type).length]));
    const folder_links = Object.fromEntries(DOCUMENT_TYPES.map(type => [type, [] as { label: string; url: string }[]]));
    return { owner_id: ownerId, name: ownerName, own: ownerId === user.id, counts, total: records.length, documents: records, folder_links };
  });
  return { summary, documents: summary.flatMap(row => row.documents).sort((a, b) => b.document_date.localeCompare(a.document_date)), limit: 3000, refreshed_at: new Date().toISOString(), storage };
}
export async function previewDocument(user: LoginUser, id: string) {
  if (id.startsWith("drive:")) { const document = (await driveDocuments(user)).find(file => file.id === id); if (!document) throw new ApiError("Document not found.", 404); return { filename: document.filename, preview_url: document.drive_url }; }
  const document = await getLocalDocument(user.id, id);
  if (document.owner_id !== user.id && !["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"].includes(document.mime_type)) throw new ApiError("This format has no view-only preview. Ask the owner for a PDF, image or text version.", 403);
  return { filename: document.filename, preview_url: `/api/documents/${encodeURIComponent(document.id)}/file${document.mime_type === "application/pdf" ? "#toolbar=0&navpanes=0" : ""}` };
}
export async function localDocumentFile(user: LoginUser, id: string) {
  if (id.startsWith("drive:")) return driveDocumentFile(user, id);
  const document = await getLocalDocument(user.id, id);
  const bytes = hostedStorage() ? await hostedFile(document.storage_path) : await readFile(localFilePath(document.storage_path));
  return { document, bytes };
}
function text(form: FormData, key: string, optional = false) {
  const value = form.get(key);
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > 100) throw new ApiError(`Provide a valid ${key.replace(/_/g, " ")} (up to 100 characters).`);
  return value.trim();
}
export async function uploadDocument(user: LoginUser, form: FormData) {
  await ensureDemoRepository(user);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ApiError("Choose a non-empty document.");
  const maxMb = process.env.VERCEL ? 4 : 25;
  if (file.size > maxMb * 1024 * 1024) throw new ApiError(`This deployment accepts files up to ${maxMb} MB.`, 413);
  const type = text(form, "document_type");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(type)) throw new ApiError("Choose a document type.");
  const patientChoice = text(form, "patient_choice");
  if (!["me", "other"].includes(patientChoice)) throw new ApiError("Choose Me or Others.");
  const patient = patientChoice === "me" ? user.user_name : text(form, "patient_name");
  if (!patient) throw new ApiError("Add your name in the repository profile first.");
  const doctor = text(form, "doctor_name"); const city = text(form, "city", true); const date = text(form, "document_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new ApiError("Choose a valid document date.");
  const { filename, repositoryPath } = documentPath(patient, type, doctor, date, file.name);
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream";
  const storage = form.get("storage") || "local";
  if (!["local", "drive"].includes(String(storage))) throw new ApiError("Choose local storage or Google Drive.");
  const input = { owner_id: user.id, owner_name: user.user_name || "You", patient_name: safeSegment(patient), document_type: type, doctor_name: safeSegment(doctor), city: city ? safeSegment(city) : null, document_date: date, filename, original_filename: file.name.slice(0, 255), repository_path: repositoryPath, mime_type: mime, size_bytes: file.size };
  const bytes = Buffer.from(await file.arrayBuffer());
  const document = storage === "drive" ? await uploadDriveDocument(user, input, bytes) : await saveLocalDocument(input, bytes, filename.match(/\.[^.]+$/)?.[0] || "");
  const event = await scheduleDocumentReview(user.id, document.patient_name, type, document.doctor_name, date);
  const calendar = event ? await syncGoogleEvent(user.id, event) : { synced: false };
  return { id: document.id, filename, storage, repository_path: repositoryPath, calendar_event: event ? { id: event.id, title: event.title, starts_at: event.starts_at, ...calendar } : null };
}
