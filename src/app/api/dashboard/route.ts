import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { errorResponse } from "@/lib/server/prototype-auth";
import { dashboardSummary } from "@/lib/server/dashboard-summary";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await dashboardSummary(await requireUser()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
