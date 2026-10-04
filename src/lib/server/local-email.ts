import nodemailer from "nodemailer";
import { localOwnedMember, patchLocalMember } from "./local-health-data";
import { appOrigin } from "./google-drive";
import { logAgentEvent } from "./agent-run-log";
import type { LoginUser } from "./login-store";
const sending = new Map<string, Promise<string>>();
export async function emailLocalMember(user: LoginUser, id: string, event: "invitation" | "revocation", runId: string) {
  const key = `${user.id}:${id}:${event}`;
  if (sending.has(key)) return sending.get(key)!;
  const work = (async () => {
    const grant = await localOwnedMember(user.id, id);
    const field = event === "invitation" ? "invitation_email_status" : "revocation_email_status";
    if (grant[field] === "sent") return "sent";
    if (event === "invitation" && !["pending_acceptance", "pending_signature"].includes(grant.status)) return "not_sent";
    if (event === "revocation" && grant.status !== "revoked") return "not_sent";
    let status = "not_configured";
    if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NODE_ENV !== "test") {
      const subject = event === "invitation" ? "Sarathi: invitation to view family records" : "Sarathi: your access has been revoked";
      const text = event === "invitation" ? `${user.user_name || "A family member"} invited you to view their Sarathi demo repository. Access requires the owner’s verified consent and your acceptance. Sign in using this email and check the invitation at ${appOrigin()}/members. Access is view-only. This does not grant access to Google Drive files.` : `${user.user_name || "The repository owner"} revoked your access to their Sarathi demo repository. ${appOrigin()}/members`;
      try {
        const transport = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS.replace(/\s/g, "") }, connectionTimeout: 10000, socketTimeout: 15000 });
        await logAgentEvent(runId, "tool_call", { provider: "Gmail SMTP", operation: "send email", recipient: grant.email, subject, message: text });
        await transport.sendMail({ from: { name: "Sarathi", address: process.env.SMTP_USER }, to: grant.email, subject, text });
        status = "sent";
        await logAgentEvent(runId, "message_sent", { channel: "Email", recipient: grant.email, subject, message: text }).catch(() => undefined);
      } catch { status = "failed"; }
      await logAgentEvent(runId, "tool_response", { provider: "Gmail SMTP", operation: "send email", status });
    }
    await patchLocalMember(user.id, id, { [field]: status });
    return status;
  })();
  sending.set(key, work); try { return await work; } finally { sending.delete(key); }
}
