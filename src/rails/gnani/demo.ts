import type { ActivityEvent, LabInquiryResult, PharmacyInquiryResult, TranscriptTurn, VoiceCall } from "@/lib/types";
import { createLabInquiryPlan, createPharmacyInquiryPlan, parseLabInquiryResult, parsePharmacyInquiryResult } from "./flow";
import { GnaniSpeechClient } from "./client";
import { ScriptedCallTransport, type CallTransport } from "./transport";

export type VoiceDemoInput = { useCase: "lab_inquiry"; testName: string } | { useCase: "pharmacy_inquiry"; medicineName: string };
export type VoiceDemoResult = { call: VoiceCall; turns: TranscriptTurn[]; activity: ActivityEvent[]; result: LabInquiryResult | PharmacyInquiryResult };

const dataUri = (base64: string, mimeType: string) => `data:${mimeType};base64,${base64.includes(",") ? base64.split(",").pop() : base64}`;

export async function runVoiceDemo(input: VoiceDemoInput, speech: GnaniSpeechClient, transport?: CallTransport): Promise<VoiceDemoResult> {
  const plan = input.useCase === "lab_inquiry" ? createLabInquiryPlan(input) : createPharmacyInquiryPlan(input);
  const callTransport = transport ?? new ScriptedCallTransport(plan);
  const id = crypto.randomUUID();
  const turns: TranscriptTurn[] = [];
  let staffTranscript = "";
  for (const [index, turn] of plan.turns.entries()) {
    const scriptedText = turn.speaker === "staff" ? await callTransport.getStaffReply() : turn.text;
    const audio = await speech.synthesizeSpeech(scriptedText);
    const text = turn.speaker === "staff" ? await speech.transcribeCallTurn(audio.audioBase64) : turn.text;
    if (turn.speaker === "staff") staffTranscript = text;
    turns.push({ id: `${id}-${index}`, speaker: turn.speaker, text, audioDataUri: dataUri(audio.audioBase64, audio.mimeType), source: turn.speaker === "staff" ? "gnani_stt" : "script" });
  }
  const result = input.useCase === "lab_inquiry" ? parseLabInquiryResult(input.testName, staffTranscript) : parsePharmacyInquiryResult(input.medicineName, staffTranscript);
  const at = new Date().toISOString();
  return { call: { id, useCase: input.useCase, status: "completed", startedAt: at, completedAt: at }, turns, result, activity: [
    { id: `${id}-started`, type: "voice_call_started", message: "Started a simulated outbound voice inquiry.", occurredAt: at },
    { id: `${id}-completed`, type: "voice_call_completed", message: "Transcribed the scripted staff response and extracted the inquiry result.", occurredAt: at },
  ] };
}
