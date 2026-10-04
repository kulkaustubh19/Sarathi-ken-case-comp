import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { documentSummary, uploadDocument } from "@/lib/server/document-service";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(); const runId = newAgentRunId(user.id); const result = await documentSummary(user, new URL(request.url).searchParams.get("storage") === "drive" ? "drive" : "local");
    await logAgentEvent(runId, "user_input", { connector: "Sarathi document screen", source: "Authenticated browser → GET /api/documents", action: "Fetch authorized document counts" });
    await logAgentEvent(runId, "decision", { decided: result.summary.map(row => ({ own: row.own, counts: row.counts })), why: "Return only the owner repository and currently authorized local shared demo repository; no file content is fetched for counts.", through: "Sarathi documents", to: "Signed-in user" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const runId = newAgentRunId(user.id);
    if (Number(request.headers.get("content-length")) > 26 * 1024 * 1024) throw new ApiError("The prototype accepts files up to 25 MB.", 413);
    const form = await request.formData();
    const inputFile = form.get("file");
    await logAgentEvent(runId, "user_input", { action: "upload document", document_type: form.get("document_type"), date: form.get("document_date"), file_size_bytes: inputFile instanceof File ? inputFile.size : null });
    const uploaded = await uploadDocument(user, form);
    await logAgentEvent(runId, "decision", { input: { document_type: form.get("document_type") }, connector: "Sarathi upload", source: "User-selected local file and metadata", decided: uploaded.calendar_event || "Save without a care task", why: "Prototype template: Prescription → Order medicines; Medical Report → Blood test. Do not infer treatment or create a real booking.", through: "Local Sarathi Tasks", to: "Signed-in user" });
    await logAgentEvent(runId, "tool_response", { provider: uploaded.storage === "drive" ? "Google Drive" : "Local storage", operation: "save document", result: "stored", document_type: form.get("document_type") });
    await logAgentEvent(runId, "message_sent", { channel: "Sarathi documents", message: uploaded.calendar_event ? `Document saved to ${uploaded.storage} and a static care task was created. Calendar sync: ${uploaded.calendar_event.synced ? "confirmed" : "not synced"}.` : `Document saved to ${uploaded.storage}.` });
    return NextResponse.json(uploaded, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return errorResponse(error); }
}
