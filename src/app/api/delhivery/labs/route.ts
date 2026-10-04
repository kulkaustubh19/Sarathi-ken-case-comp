import { locationError } from "@/lib/server/location-error";
import { rememberVerifiedLabs } from "@/lib/server/booking-flow";
import { logAgentEvent, newAgentRunId } from "@/lib/server/agent-run-log";
import { NextResponse } from "next/server";
import { rankSuitableLabs } from "@/rails/delhivery";
import { requireUser } from "@/lib/server/profile";
import { ApiError, checkOrigin, errorResponse } from "@/lib/server/prototype-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await requireUser(); const body = await request.json().catch(() => null);
    const point = body?.address?.location;
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || body.address.validation?.quality !== "ok" || !body.address.confirmedAt) throw new ApiError("Confirm a complete care address first.");
    if (!Array.isArray(body.labAddresses) || body.labAddresses.length !== 3 || body.labAddresses.some((item: unknown) => typeof item !== "string" || !item.trim() || item.length > 500)) throw new ApiError("Enter three lab addresses, each up to 500 characters.");
    if (body.labNames !== undefined && (!Array.isArray(body.labNames) || body.labNames.length !== 3 || body.labNames.some((name: unknown) => typeof name !== "string" || !name.trim() || name.length > 80) || new Set(body.labNames.map((name: string) => name.trim().toLowerCase())).size !== 3)) throw new ApiError("Provide three different lab names, up to 80 characters each.");
    const runId = newAgentRunId(user.id);
    await logAgentEvent(runId, "user_input", { connector: "Sarathi location screen", source: "Authenticated browser → POST /api/delhivery/labs", input: body });
    const result = await rankSuitableLabs(body.address, body.labAddresses, runId, body.demo === true);
    for (const lab of [...result.ranked, ...result.unverified]) lab.name = body.labNames?.[Number(lab.id.split("-").at(-1)) - 1]?.trim() || lab.name;
    await rememberVerifiedLabs(user.id, result);
    await logAgentEvent(runId, "message_sent", { channel: "Sarathi chat", to: "Signed-in user", message: result.ranked.length ? "The verified lab list is ready. Select a lab, then ask me to book a blood test with it." : "No lab addresses could be verified. Update the addresses and fetch again." });
    await logAgentEvent(runId, "decision", { input: result.ranked, decided: result.selected?.name || "No suitable candidate", why: "Exclude incomplete addresses; choose shortest straight-line distance among verified supplied candidates, not medical suitability.", message: result.rationale, through: "Sarathi location screen", to: "Signed-in user", calculation: "Local Haversine, not Delhivery routing" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(locationError(error)); }
}

