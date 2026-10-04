import { getPromptAudio } from "@/rails/gnani/twilio";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ callId: string }> }) { const { callId } = await params; const audio = getPromptAudio(callId); return audio ? new Response(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } }) : new Response("Not found", { status: 404 }); }
