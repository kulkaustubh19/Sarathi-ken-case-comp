import nodemailer from "nodemailer";
import { db, eq } from "./database";
import { appOrigin } from "./google-drive";
import type { AccessGrant } from "../documents";
import { logAgentEvent, newAgentRunId } from "./agent-run-log";

type Outbox = { id: string; access_id: string; event: "invitation" | "revocation"; recipient: string; subject: string; body: string; status: string };
export async function notifyAccess(grant: AccessGrant, ownerName: string, event: Outbox["event"], runId = newAgentRunId(grant.owner_id)) {
  let mail = (await db<Outbox>("healthnest_email_outbox", `?access_id=eq.${eq(grant.id)}&event=eq.${event}&limit=1`))[0];
  if (!mail) {
    const invitation = event === "invitation";
    mail = (await db<Outbox>("healthnest_email_outbox", "", { method: "POST", body: JSON.stringify({ access_id: grant.id, event, recipient: grant.recipient_email, subject: invitation ? "Sarathi: view-only document access granted" : "Sarathi: your document access has been revoked", body: invitation ? `${ownerName} has granted you view-only access to their Sarathi document repository. Sign in at ${appOrigin()}/documents and connect the Google account for ${grant.recipient_email}. Editing is not permitted; reader download, print and copy restrictions apply. Sarathi is currently a prototype—use sample details only.` : `${ownerName} has revoked your access to their Sarathi document repository. You can no longer view these shared documents. Visit ${appOrigin()}/members to review your other access.` }) }))[0];
  }
  if (mail.status === "sent") return "sent";
  let status = "queued";
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      if (process.env.SMTP_USER.toLowerCase() !== "kulkarnikaustubh172@gmail.com") throw new Error("Sender account mismatch");
      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 10000, socketTimeout: 15000 });
      await logAgentEvent(runId, "tool_call", { provider: "Gmail", operation: "send email", recipient: mail.recipient, subject: mail.subject, message: mail.body.split(ownerName).join("[OWNER]") });
      await transporter.sendMail({ from: { name: "Sarathi", address: "kulkarnikaustubh172@gmail.com" }, to: mail.recipient, subject: mail.subject, text: mail.body });
      status = "sent";
    } catch { status = "failed"; }
  }
  await db("healthnest_email_outbox", `?id=eq.${eq(mail.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  await db("document_access", `?id=eq.${eq(grant.id)}`, { method: "PATCH", body: JSON.stringify({ [event === "invitation" ? "invitation_email_status" : "revocation_email_status"]: status }) });
  await logAgentEvent(runId, "tool_response", { provider: "Gmail", operation: "send email", status, recipient: mail.recipient });
  if (status === "sent") await logAgentEvent(runId, "message_sent", { channel: "Email", recipient: mail.recipient, subject: mail.subject, message: mail.body.split(ownerName).join("[OWNER]") });
  return status;
}
