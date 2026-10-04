import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/profile";
import { localDocumentFile } from "@/lib/server/document-service";
import { ApiError, errorResponse } from "@/lib/server/prototype-auth";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(); const { document, bytes } = await localDocumentFile(user, (await context.params).id);
    const previewable = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"].includes(document.mime_type);
    if (document.owner_id !== user.id && !previewable) throw new ApiError("This shared file format has no view-only preview.", 403);
    const type = previewable ? document.mime_type : "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": type, "Content-Disposition": `${previewable ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(document.filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return errorResponse(error); }
}
