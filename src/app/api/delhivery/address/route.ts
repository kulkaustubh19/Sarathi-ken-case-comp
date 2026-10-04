import { locationError } from "@/lib/server/location-error";
import { NextResponse } from "next/server";
import { standardizeCareAddress } from "@/rails/delhivery";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); const body = await request.json().catch(() => null);
    if (typeof body?.address !== "string" || !body.address.trim() || body.address.length > 500) throw new ApiError("Enter a care address of up to 500 characters.");
    const runId = newAgentRunId(user.id);
    await logAgentEvent(runId, "user_input", { connector: "Sarathi location screen", source: "Authenticated browser → POST /api/delhivery/address", input: body });
    await logAgentEvent(runId, "tool_call", { provider: "Delhivery", operation: "validate care address", mode: body.demo !== true && process.env.DELHIVERY_MAPS_TOKEN ? "live" : "demo" });
    const result = await standardizeCareAddress(body.address.trim(), runId, body.demo === true);
    await logAgentEvent(runId, "tool_response", { provider: "Delhivery", operation: "validate care address", quality: result.validation.quality, source: result.source });
    await logAgentEvent(runId, "decision", { decided: result.validation.quality === "ok" ? "Offer address confirmation" : "Ask for missing address fields", why: "Require a complete validated address before care logistics; require user confirmation.", input: result.validation, message: result.validation.reason, through: "Sarathi location screen", to: "Signed-in user" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(locationError(error)); }
}

