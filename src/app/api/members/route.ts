import { emailLocalMember } from "@/lib/server/local-email";
import { localOwnedMember } from "@/lib/server/local-health-data";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
import { ensureDemoRepository, localMemberAction, localMemberOverview } from "@/lib/server/local-health-data";
import { finishLocalConsent } from "@/lib/server/local-sharing";
import { sharingConsent } from "@/lib/documents";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireUser(); await ensureDemoRepository(user); return NextResponse.json(await localMemberOverview(user.id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    if (!body || typeof body.action !== "string") throw new ApiError("Choose a member action.");
    await ensureDemoRepository(user);
    const runId = newAgentRunId(user.id);
    await logAgentEvent(runId, "user_input", { action: body.action, member_email: body.email, member_id: body.id });
    if (body.action === "add") {
      if (body.consent !== true || typeof body.email !== "string" || body.email.length > 254) throw new ApiError("Review and approve the sharing consent first.");
      const signed = process.env.SHARING_CONSENT_MODE === "setu_esign";
      const result = await localMemberAction(user.id, "add", body.email, signed, sharingConsent(body.email), typeof body.member_name === "string" ? body.member_name.slice(0,100) : "");
      if (result.grant) result.email_status = await emailLocalMember(user, result.grant.id, "invitation", runId);
      if (signed && result.grant) await finishLocalConsent(user, result.grant.id, runId);
      await logAgentEvent(runId, "decision", { decided: signed ? "Await verified Setu consent" : "Await recipient acceptance", why: "Do not grant record access before required consent and recipient acceptance.", through: "Sarathi Members", to: "Repository owner" });
      return NextResponse.json(result, { status: 201 });
    }
    if (["remove", "leave", "accept", "decline"].includes(body.action)) {
      if (typeof body.id !== "string") throw new ApiError("Choose a valid member.");
      const result = await localMemberAction(user.id, body.action, body.id);
      if (body.action === "remove") result.email_status = await emailLocalMember(user, body.id, "revocation", runId);
      await logAgentEvent(runId, "decision", { decided: body.action, why: "Only the repository owner may revoke a grant; only the addressed recipient may accept or decline an invitation. Active access requires verified consent and acceptance.", through: "Sarathi local sharing", to: "Signed-in user", action: body.action });
      await logAgentEvent(runId, "message_sent", { channel: "Sarathi Members", to: "Signed-in user", message: body.action === "accept" ? "Invitation accepted. You can now view this repository." : `Access updated. Email status: ${result.email_status}.` });
      return NextResponse.json(result);
    }
    if (body.action === "check-consent") { if (typeof body.id !== "string") throw new ApiError("Choose an invitation."); return NextResponse.json(await finishLocalConsent(user, body.id, runId)); }
    if (body.action === "retry-email") { const grant = await localOwnedMember(user.id, body.id); return NextResponse.json({ email_status: await emailLocalMember(user, grant.id, grant.status === "revoked" ? "revocation" : "invitation", runId) }); }
    throw new ApiError("Unknown member action.");
  } catch (error) { return errorResponse(error); }
}
