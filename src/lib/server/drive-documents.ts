import { ownerDrive, driveRequest, folder } from "./google-drive";
import { ApiError } from "./prototype-auth";
import type { LoginUser } from "./login-store";
import type { LocalDocument } from "./local-health-data";
import { DOCUMENT_TYPES } from "../documents";

type FileInfo = { id: string; name: string; mimeType: string; size?: string; createdTime?: string; appProperties?: Record<string,string> };
export async function driveDocuments(user: LoginUser) {
  const { stored, token } = await ownerDrive(user.id);
  const documents: (Omit<LocalDocument,"storage_path"> & { drive_file_id: string; drive_url: string })[] = [];
  let folders = 0;
  async function walk(parent: string, parts: string[]) {
    if (++folders > 300) throw new ApiError("Repository has too many folders for this prototype scan.", 413);
    let page: string | undefined;
    do {
      const result: { files: FileInfo[]; nextPageToken?: string } = await driveRequest(token, `files?q=${encodeURIComponent(`'${parent}' in parents and trashed = false`)}&fields=nextPageToken,files(id,name,mimeType,size,createdTime,appProperties)&pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
      for (const file of result.files) {
        if (file.mimeType === "application/vnd.google-apps.folder") { if (parts.length < 3) await walk(file.id, [...parts, file.name]); continue; }
        if (documents.length >= 3000) throw new ApiError("Repository exceeds the 3000-document scan limit.", 413);
        const meta = file.appProperties || {}; const type = meta.document_type || parts[2] || "Other";
        documents.push({ id: `drive:${file.id}`, owner_id: user.id, owner_name: user.user_name || "You", patient_name: meta.patient_name || parts[0] || "Unspecified", document_type: (DOCUMENT_TYPES as readonly string[]).includes(type) ? type : "Other", doctor_name: meta.doctor_name || "", city: meta.city || null, document_date: meta.document_date || (file.createdTime || new Date().toISOString()).slice(0,10), filename: file.name, original_filename: file.name, repository_path: [...parts,file.name].join("/"), mime_type: file.mimeType, size_bytes: Number(file.size || 0), created_at: file.createdTime || new Date().toISOString(), drive_file_id: file.id, drive_url: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view` });
      }
      page = result.nextPageToken;
    } while (page);
  }
  await walk(stored.repository_folder_id, []);
  return documents;
}
export async function uploadDriveDocument(user: LoginUser, document: Omit<LocalDocument,"id"|"created_at"|"storage_path">, bytes: Buffer) {
  const { stored, token } = await ownerDrive(user.id);
  let parent = stored.repository_folder_id;
  for (const part of document.repository_path.split("/").slice(0,-1)) parent = await folder(token, part, parent);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": document.mime_type, "X-Upload-Content-Length": String(bytes.length) }, body: JSON.stringify({ name: document.filename, parents: [parent], copyRequiresWriterPermission: true, appProperties: { patient_name: document.patient_name, document_type: document.document_type, doctor_name: document.doctor_name, document_date: document.document_date, city: document.city || "" } }), signal: AbortSignal.timeout(20000) });
  const location = response.headers.get("location");
  if (!response.ok || !location || new URL(location).origin !== "https://www.googleapis.com") throw new ApiError("Google Drive could not start the upload. Check permissions and quota.", 503);
  const uploaded = await fetch(location, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": document.mime_type }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(60000) });
  if (!uploaded.ok) throw new ApiError("Google Drive upload failed. No local copy was saved.", 503);
  const result = await uploaded.json();
  if (!result.id) throw new ApiError("Google Drive did not confirm the uploaded file.", 503);
  return { id: `drive:${result.id}`, ...document };
}

export async function driveDocumentFile(user: LoginUser, id: string) {
  const document = (await driveDocuments(user)).find(file => file.id === id);
  if (!document) throw new ApiError("Document not found in your authorized Drive repository.", 404);
  if (document.size_bytes > 25 * 1024 * 1024) throw new ApiError("This document exceeds the 25 MB reading limit.", 413);
  const { token } = await ownerDrive(user.id);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.drive_file_id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw new ApiError("Unable to read this Drive file. Google-native documents need to be exported as PDF first.", 503);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 25 * 1024 * 1024) { await reader.cancel(); throw new ApiError("This document exceeds the reading limit.", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  return { document, bytes: Buffer.concat(chunks) };
}
