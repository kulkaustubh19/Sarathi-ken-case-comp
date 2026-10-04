import { randomUUID } from "node:crypto";
import { db, eq } from "./database";
import { ApiError, normalizeEmail } from "./prototype-auth";
import { connection, deletePermission, driveRequest, ownerDrive } from "./google-drive";
import { findUser, type LoginUser } from "./login-store";
import { sharingConsent, type AccessGrant } from "../documents";
import { consentComplete, startConsent } from "@/rails/pine-labs/esign";
import { notifyAccess } from "./email";

const ownerQueues = new Map<string, Promise<unknown>>();
async function serialized<T>(ownerId: string, action: () => Promise<T>): Promise<T> {
  const previous = ownerQueues.get(ownerId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  ownerQueues.set(ownerId, next);
  try { return await next; }
  finally { if (ownerQueues.get(ownerId) === next) ownerQueues.delete(ownerId); }
}

async function ownedGrant(user: LoginUser, id: string) {
  const grant = (await db<AccessGrant>("document_access", `?id=eq.${eq(id)}&owner_id=eq.${eq(user.id)}&limit=1`))[0];
  if (!grant) throw new ApiError("Member access not found.", 404);
  return grant;
}
async function patch(grant: AccessGrant, values: Partial<AccessGrant>) { return (await db<AccessGrant>("document_access", `?id=eq.${eq(grant.id)}`, { method: "PATCH", body: JSON.stringify(values) }))[0]; }
export async function memberOverview(user: LoginUser) {
  const google = await connection(user.id);
  const outgoing = await db<AccessGrant>("document_access", `?owner_id=eq.${eq(user.id)}&order=created_at.desc`);
  const received = google ? await db<AccessGrant>("document_access", `?recipient_email=eq.${eq(google.google_email)}&status=eq.active`) : [];
  const incoming = await Promise.all(received.map(async grant => { const owner = await findUser("id", grant.owner_id); return { id: grant.id, owner_name: owner?.user_name || "Family member", status: grant.status, created_at: grant.created_at }; }));
  return { outgoing: outgoing.map(({ drive_permission_id, ...grant }) => { void drive_permission_id; return grant; }), incoming, google_connected: Boolean(google), consent_mode: process.env.SHARING_CONSENT_MODE || "prototype" };
}
async function activate(user: LoginUser, grant: AccessGrant, runId?: string) {
  if (grant.status === "active") return { grant, email_status: await notifyAccess(grant, user.user_name || "A family member", "invitation", runId) };
  if (!["pending_drive", "pending_signature"].includes(grant.status)) throw new ApiError("This access is being revoked or has already been revoked.", 409);
  const { stored, token } = await ownerDrive(user.id);
  const permission = await driveRequest<{ id: string }>(token, `files/${encodeURIComponent(stored.repository_folder_id)}/permissions?sendNotificationEmail=false&fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "user", role: "reader", emailAddress: grant.recipient_email }) });
  try {
    const activated = (await db<AccessGrant>("document_access", `?id=eq.${eq(grant.id)}&status=in.(pending_drive,pending_signature)`, { method: "PATCH", body: JSON.stringify({ status: "active", drive_permission_id: permission.id }) }))[0];
    if (!activated) throw new ApiError("Access changed while granting permission. Refresh the members list.", 409);
    grant = activated;
  }
  catch (error) { await deletePermission(token, stored.repository_folder_id, permission.id).catch(() => undefined); throw error; }
  const email_status = await notifyAccess(grant, user.user_name || "A family member", "invitation", runId);
  return { grant, email_status };
}
async function addMemberImpl(user: LoginUser, body: Record<string, unknown>, runId?: string) {
  const email = normalizeEmail(body.email);
  if (body.consent !== true) throw new ApiError("Approve the view-only sharing consent before adding a member.");
  const google = await connection(user.id);
  if (!google) throw new ApiError("Connect Google Drive before sharing documents.", 409);
  if (email === google.google_email) throw new ApiError("Your own Google account already owns this repository.");
  if ((await db<AccessGrant>("document_access", `?owner_id=eq.${eq(user.id)}&recipient_email=eq.${eq(email)}&status=neq.revoked&limit=1`))[0]) throw new ApiError("This member already has active or pending access.", 409);
  const mode = process.env.SHARING_CONSENT_MODE || "prototype";
  if (!["prototype", "setu_esign"].includes(mode)) throw new ApiError("Set SHARING_CONSENT_MODE to prototype or setu_esign.", 503);
  const grant = (await db<AccessGrant>("document_access", "", { method: "POST", body: JSON.stringify({ id: randomUUID(), owner_id: user.id, recipient_email: email, status: mode === "setu_esign" ? "pending_signature" : "pending_drive", consent_method: mode, consent_text: sharingConsent(email), consent_version: "healthnest-sharing-v1", consent_accepted_at: new Date().toISOString() }) }))[0];
  if (mode === "setu_esign") return finishConsentImpl(user, grant.id, runId);
  return activate(user, grant, runId);
}
async function finishConsentImpl(user: LoginUser, id: string, runId?: string) {
  let grant = await ownedGrant(user, id);
  if (grant.status === "revoked" || grant.status === "revoking") throw new ApiError("This access has been revoked.", 409);
  if (grant.consent_method === "setu_esign" && !grant.signed_at) {
    if (!grant.signature_request_id) {
      grant = await patch(grant, await startConsent(user, grant.recipient_email, grant.id, runId));
      return { grant, email_status: "not_sent", pending_signature: true };
    }
    if (!await consentComplete(grant.signature_request_id, user.mobile_number, runId)) return { grant, email_status: "not_sent", pending_signature: true };
    const verified = (await db<AccessGrant>("document_access", `?id=eq.${eq(grant.id)}&status=eq.pending_signature`, { method: "PATCH", body: JSON.stringify({ signed_at: new Date().toISOString(), status: "pending_drive" }) }))[0];
    if (!verified) throw new ApiError("This consent was revoked or changed. Refresh the members list.", 409);
    grant = verified;
  }
  return activate(user, grant, runId);
}
async function removeMemberImpl(user: LoginUser, id: string, runId?: string) {
  let grant = await ownedGrant(user, id);
  if (grant.status !== "revoked") {
    // Block application access first, even if Google is temporarily unavailable.
    grant = await patch(grant, { status: "revoking" });
    if (grant.drive_permission_id) {
      const { token, stored } = await ownerDrive(user.id);
      await deletePermission(token, stored.repository_folder_id, grant.drive_permission_id);
    }
    grant = await patch(grant, { status: "revoked", revoked_at: new Date().toISOString() });
  }
  return { grant, email_status: await notifyAccess(grant, user.user_name || "A family member", "revocation", runId) };
}
async function retryEmailImpl(user: LoginUser, id: string, runId?: string) {
  const grant = await ownedGrant(user, id);
  if (!["active", "revoked"].includes(grant.status)) throw new ApiError("Complete the sharing or revocation step before sending its email.");
  return { email_status: await notifyAccess(grant, user.user_name || "A family member", grant.status === "revoked" ? "revocation" : "invitation", runId) };
}
export const addMember = (user: LoginUser, body: Record<string, unknown>, runId?: string) => serialized(user.id, () => addMemberImpl(user, body, runId));
export const finishConsent = (user: LoginUser, id: string, runId?: string) => serialized(user.id, () => finishConsentImpl(user, id, runId));
export const removeMember = (user: LoginUser, id: string, runId?: string) => serialized(user.id, () => removeMemberImpl(user, id, runId));
export const retryEmail = (user: LoginUser, id: string, runId?: string) => serialized(user.id, () => retryEmailImpl(user, id, runId));
export async function leaveAccess(user: LoginUser, id: string) {
  const google = await connection(user.id);
  const grant = (await db<AccessGrant>("document_access", `?id=eq.${eq(id)}&status=eq.active&limit=1`))[0];
  if (!google || !grant || grant.recipient_email !== google.google_email) throw new ApiError("Shared access not found.", 404);
  const owner = await findUser("id", grant.owner_id);
  if (!owner) throw new ApiError("Repository owner not found.", 404);
  return removeMember(owner, grant.id);
}
