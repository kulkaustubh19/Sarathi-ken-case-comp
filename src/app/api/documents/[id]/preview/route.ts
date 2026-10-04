import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { errorResponse } from "@/lib/server/prototype-auth";
import { previewDocument } from "@/lib/server/document-service";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await previewDocument(await requireUser(), (await context.params).id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
