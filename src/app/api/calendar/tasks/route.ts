import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { errorResponse } from "@/lib/server/prototype-auth";
import { upcomingCalendarTasks } from "@/lib/server/calendar-service";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireUser(); const tasks = await upcomingCalendarTasks(user); return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
