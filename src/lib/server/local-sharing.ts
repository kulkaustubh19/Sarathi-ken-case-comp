import { emailLocalMember } from "./local-email";
import type { LoginUser } from "./login-store";
import { localOwnedMember, patchLocalMember } from "./local-health-data";
import { consentComplete, startConsent } from "@/rails/pine-labs/esign";
import { ApiError } from "./prototype-auth";
import { logAgentEvent } from "./agent-run-log";

const singleton = globalThis as typeof globalThis & { __sarathiSigning?: Map<string, Promise<unknown>> };
const signing = singleton.__sarathiSigning ??= new Map();
export async function finishLocalConsent(user: LoginUser, id: string, runId: string) {
  const key = `${user.id}:${id}`;
  const previous = signing.get(key);
  if (previous) return previous;
  const work = (async () => {
    let grant = await localOwnedMember(user.id, id);
    if (grant.status === "revoked") throw new ApiError("This invitation was revoked.", 409);
    if (grant.consent_method !== "setu_esign") throw new ApiError("This invitation does not use Setu consent.");
    if (!grant.signed_at) {
      if (!grant.signature_request_id) {
        grant = await patchLocalMember(user.id, id, await startConsent(user, grant.email, id, runId));
        return { grant, pending_signature: true, local_only: true };
      }
      if (!await consentComplete(grant.signature_request_id, user.mobile_number, runId)) return { grant, pending_signature: true, local_only: true };
      grant = await patchLocalMember(user.id, id, { signed_at: new Date().toISOString(), status: "pending_acceptance", signing_url: undefined });
      await logAgentEvent(runId, "decision", { decided: "Verified Setu consent; invitation awaits recipient acceptance", why: "Require the matching signature request and expected signed signer; never trust a redirect flag or checkbox as an eSignature.", through: "Setu eSign status → Sarathi Members", to: "Repository owner", action: "pending_acceptance" });
    }
    const email_status = await emailLocalMember(user, id, "invitation", runId);
    return { grant, pending_signature: false, local_only: true, email_status };
  })();
  signing.set(key, work);
  try { return await work; } finally { if (signing.get(key) === work) signing.delete(key); }
}
