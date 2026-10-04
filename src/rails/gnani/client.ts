import { tracedPartnerFetch } from "@/lib/server/partner-trace";
import type { RailAdapter } from "@/lib/rail-types";

const TTS_URL = "https://api.vachana.ai/api/v1/tts/inference";
const STT_URL = "https://api.vachana.ai/stt/v3";

export class GnaniError extends Error {}

export interface SynthesizedAudio {
  audioBase64: string;
  mimeType: "audio/wav";
}

function base64ToBytes(value: string): ArrayBuffer {
  const raw = value.includes(",") ? value.split(",").pop()! : value;
  const bytes = Buffer.from(raw, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class GnaniSpeechClient {
  constructor(private readonly apiKey: string, private readonly runId?: string) {}

  async synthesizeSpeech(text: string): Promise<SynthesizedAudio> {
    console.info("[Gnani TTS → request]", { text, voice: "Kaveri", model: "timbre-v2.5", language: "en-IN", audio: "wav/48000Hz/mono" });
    const response = await tracedPartnerFetch(this.runId, "Gnani", TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": this.apiKey },
      body: JSON.stringify({ text, voice: "Kaveri", model: "timbre-v2.5", language: "en-IN", speed: 1, audio_config: { container: "wav", sample_rate: 48000, num_channels: 1, sample_width: 2, encoding: "linear_pcm" } }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      console.error("[Gnani TTS ← error]", { status: response.status, detail });
      throw new GnaniError(`TTS failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const audio = await response.arrayBuffer();
    console.info("[Gnani TTS ← response]", { status: response.status, contentType: response.headers.get("content-type"), audioBytes: audio.byteLength });
    return { audioBase64: Buffer.from(audio).toString("base64"), mimeType: "audio/wav" };
  }

  async transcribeCallTurn(audioBase64: string): Promise<string> {
    const bytes = base64ToBytes(audioBase64);
    console.info("[Gnani STT → request]", { language: "en-IN", format: "transcribe", audioBytes: bytes.byteLength, file: "staff-reply.wav" });
    const form = new FormData();
    form.append("audio_file", new Blob([bytes], { type: "audio/wav" }), "staff-reply.wav");
    form.append("language_code", "en-IN");
    form.append("format", "transcribe");
    const response = await tracedPartnerFetch(this.runId, "Gnani", STT_URL, { method: "POST", headers: { "X-API-Key-ID": this.apiKey }, body: form });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240);
      console.error("[Gnani STT ← error]", { status: response.status, detail });
      throw new GnaniError(`STT failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const payload = await response.json() as { transcript?: unknown };
    if (typeof payload.transcript !== "string") throw new GnaniError("Gnani returned no transcript.");
    console.info("[Gnani STT ← response]", { status: response.status, transcript: payload.transcript });
    return payload.transcript;
  }
}

export const gnaniRail: RailAdapter = { id: "gnani", displayName: "Gnani", description: "Voice interaction and call coordination.", tools: [
  { id: "gnani.start_lab_inquiry", name: "Start lab inquiry", description: "Runs a scripted voice inquiry with a lab." },
  { id: "gnani.start_pharmacy_inquiry", name: "Start pharmacy inquiry", description: "Runs a scripted voice inquiry with a pharmacy." },
] };
