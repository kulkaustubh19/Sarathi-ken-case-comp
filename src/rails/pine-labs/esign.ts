import { tracedPartnerFetch } from "@/lib/server/partner-trace";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ApiError } from "@/lib/server/prototype-auth";
import type { LoginUser } from "@/lib/server/login-store";
import { sharingConsent } from "@/lib/documents";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";

function config() {
  const base = process.env.SETU_ESIGN_BASE_URL || "https://dg-sandbox.setu.co";
  if (!["https://dg-sandbox.setu.co", "https://dg.setu.co"].includes(base)) throw new ApiError("Use the documented Setu sandbox or production eSign URL.", 503);
  if (!process.env.SETU_CLIENT_ID || !process.env.SETU_CLIENT_SECRET || !process.env.SETU_PRODUCT_INSTANCE_ID) throw new ApiError("Setu eSign credentials are required for signed consent. Configure them in .env.local.", 503);
  return { base, headers: { "x-client-id": process.env.SETU_CLIENT_ID, "x-client-secret": process.env.SETU_CLIENT_SECRET, "x-product-instance-id": process.env.SETU_PRODUCT_INSTANCE_ID } };
}
async function request(endpoint: string, init?: RequestInit, runId?: string) {
  const { base, headers } = config();
  await logAgentEvent(runId, "tool_call", { provider: "Pine Labs / Setu eSign", operation: endpoint, method: init?.method || "GET", request: "Consent document or status request; credentials omitted." });
  const response = await tracedPartnerFetch(runId, "Pine Labs / Setu eSign", `${base}${endpoint}`, { ...init, headers: { ...headers, ...(init?.headers || {}) }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) { await logAgentEvent(runId, "tool_response", { provider: "Pine Labs / Setu eSign", operation: endpoint, status: response.status, result: "failed" }); throw new ApiError("Setu eSign could not complete the consent request. Check the sandbox credentials and product access.", 503); }
  const result = await response.json();
  await logAgentEvent(runId, "tool_response", { provider: "Pine Labs / Setu eSign", operation: endpoint, status: response.status, result: { id: result.id, status: result.status, signer_statuses: Array.isArray(result.signers) ? result.signers.map((signer: { status?: string }) => signer.status) : undefined } });
  return result;
}
export async function consentPdf(user: LoginUser, email: string, accessId: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  // Preserve non-Latin names reversibly rather than silently replacing letters.
  const ascii = (value: string) => [...value].map(character => /^[\x20-\x7e]$/.test(character) ? character : `\\u{${character.codePointAt(0)!.toString(16)}}`).join("");
  page.drawText("Sarathi - Document Sharing Consent", { x: 48, y: 780, size: 19, font, color: rgb(0.09, 0.3, 0.22) });
  const lines = ["Care for your family, across generations.", "", `Owner: ${user.user_name || "Repository owner"}`, `Owner mobile: ${user.mobile_number}`, `Recipient: ${email}`, `Consent ID: ${accessId}`, `Issued: ${new Date().toISOString()}`, "Version: healthnest-sharing-v1", "", sharingConsent(email), "", "Withdrawal: remove the recipient in Sarathi Members.", "This agreement authorizes repository access; it does not", "transfer ownership or permit clinical decision-making.", "", "Fixed-OTP app authentication is for prototype use only."];
  let y = 736;
  for (const paragraph of lines) {
    let line = "";
    for (const character of ascii(paragraph)) {
      const next = line + character;
      if (font.widthOfTextAtSize(next, 11) > 495 && line) { page.drawText(line, { x: 48, y, size: 11, font }); y -= 17; line = character; } else line = next;
    }
    page.drawText(line, { x: 48, y, size: 11, font }); y -= 20;
  }
  return pdf.save();
}
export async function startConsent(user: LoginUser, email: string, accessId: string, runId = newAgentRunId(user.id)) {
  const redirectUrl = process.env.SETU_REDIRECT_URL;
  if (!redirectUrl || !redirectUrl.startsWith("https://")) throw new ApiError("Setu eSign requires a publicly hosted HTTPS redirect URL; set SETU_REDIRECT_URL.", 503);
  if (!/^\+91\d{10}$/.test(user.mobile_number)) throw new ApiError("Setu Aadhaar eSign requires an Indian signer mobile number.");
  const data = new FormData();
  data.set("name", `Sarathi sharing consent ${accessId}`);
  data.set("document", new Blob([new Uint8Array(await consentPdf(user, email, accessId))], { type: "application/pdf" }), "sharing-consent.pdf");
  const uploaded = await request("/api/documents", { method: "POST", body: data }, runId);
  if (typeof uploaded.id !== "string") throw new ApiError("Unexpected Setu document response.", 503);
  const signed = await request("/api/signature", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: uploaded.id, redirectUrl, reason: "Sarathi view-only document sharing consent", signers: [{ identifier: user.mobile_number.slice(3), displayName: user.user_name, signerNo: 1, signature: { onPages: ["1"], position: "bottom-right", height: 60, width: 180 } }] }) }, runId);
  const url = signed.signers?.[0]?.url;
  if (typeof signed.id !== "string" || typeof url !== "string" || !["dg-sandbox.setu.co", "dg.setu.co"].includes(new URL(url).hostname) || new URL(url).protocol !== "https:") throw new ApiError("Setu did not return a valid signing URL.", 503);
  return { signature_request_id: signed.id as string, signing_url: url as string };
}
export async function consentComplete(id: string, signerPhone: string, runId = newAgentRunId()) {
  const status = await request(`/api/signature/${encodeURIComponent(id)}`, undefined, runId);
  return status.id === id && status.status === "sign_complete" && Array.isArray(status.signers) && status.signers.some((signer: { identifier: string; status: string }) => signer.identifier === signerPhone.replace(/^\+91/, "") && signer.status === "signed");
}
