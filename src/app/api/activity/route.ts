import { NextResponse } from "next/server";
import { checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { requireUser } from "@/lib/server/profile";
import { clearAgentEvents, recentAgentEvents } from "@/lib/server/agent-run-log";
import { evidenceMarkdown } from "@/lib/server/evidence-export";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(); const events = await recentAgentEvents(user.id);
    const format = new URL(request.url).searchParams.get("format");
    if (format === "markdown") return new Response(evidenceMarkdown(events), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": "attachment; filename=healthnest-evidence.md", "Cache-Control": "no-store" } });
    return NextResponse.json({ events, retention_hours: 2, redacted: true }, { headers: { "Cache-Control": "no-store", ...(format === "json" ? { "Content-Disposition": "attachment; filename=healthnest-evidence.json" } : {}) } });
  }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try { checkOrigin(request); const user = await requireUser(); await clearAgentEvents(user.id); return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
