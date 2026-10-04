import type { CallUseCase, LabInquiryResult, PharmacyInquiryResult, TranscriptTurn } from "@/lib/types";

export interface LabInquiryInput { testName: string }
export interface PharmacyInquiryInput { medicineName: string }

export interface ScriptedCallPlan {
  useCase: CallUseCase;
  turns: Array<Pick<TranscriptTurn, "speaker" | "text">>;
}

const disclosure = "Hello. I am Sarathi, an automated family-health assistant calling with permission from a family member. This is not a medical call.";

export function createLabInquiryPlan({ testName }: LabInquiryInput): ScriptedCallPlan {
  const safeTestName = testName.trim() || "requested";
  const subject = /appointment$/i.test(safeTestName) ? safeTestName : `${safeTestName} test`;
  return {
    useCase: "lab_inquiry",
    turns: [
      { speaker: "assistant", text: `${disclosure} I am checking details for a ${subject}. Is it available, what is the earliest slot, are there any preparation instructions, and what is the price?` },
      { speaker: "staff", text: `Yes, the ${subject} is available. The earliest slot is tomorrow at 9:30 AM. ${/appointment$/i.test(safeTestName) ? "Please confirm preparation instructions directly with the provider." : "Please fast for 10 hours before the test."} The price is rupees 1,200.` },
    ],
  };
}

export function createPharmacyInquiryPlan({ medicineName }: PharmacyInquiryInput): ScriptedCallPlan {
  const safeMedicineName = medicineName.trim() || "requested medicine";
  return {
    useCase: "pharmacy_inquiry",
    turns: [
      { speaker: "assistant", text: `${disclosure} I am checking availability of ${safeMedicineName}. Could you confirm whether it is in stock, how many units are available, the price, and whether delivery is available?` },
      { speaker: "staff", text: `Yes, ${safeMedicineName} is in stock. We have 12 strips available. The price is rupees 340 per strip, and delivery is available in the local area.` },
    ],
  };
}

function rupees(text: string): number | undefined {
  const match = text.match(/(?:₹|rupees?|rs\.?)[\s:]*([\d,]+)/i);
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

export function parseLabInquiryResult(testName: string, transcript: string): LabInquiryResult {
  const needsConfirmation: string[] = [];
  const available = /\b(available|in stock|yes)\b/i.test(transcript) && !/not available|unavailable/i.test(transcript);
  const slot = transcript.match(/(?:earliest slot is|slot is)\s+([^.!]+)/i)?.[1]?.trim();
  const fastingHours = Number(transcript.match(/fast(?:ing)?\s+for\s+(\d+)\s+hours?/i)?.[1]);
  const priceInr = rupees(transcript);
  if (!/available|unavailable/i.test(transcript)) needsConfirmation.push("availability");
  if (!slot) needsConfirmation.push("earliest slot");
  if (!fastingHours) needsConfirmation.push("preparation instructions");
  if (!priceInr) needsConfirmation.push("price");
  return { testName, available, earliestSlot: slot, preparation: fastingHours ? `Fast for ${fastingHours} hours before the test.` : undefined, fastingHours: fastingHours || undefined, priceInr, needsConfirmation };
}

export function parsePharmacyInquiryResult(medicineName: string, transcript: string): PharmacyInquiryResult {
  const needsConfirmation: string[] = [];
  const available = /\b(in stock|available|yes)\b/i.test(transcript) && !/not available|out of stock/i.test(transcript);
  const quantityAvailable = Number(transcript.match(/(?:have|stock of)\s+(\d+)\s+(?:strips?|units?)/i)?.[1]);
  const priceInr = rupees(transcript);
  const deliveryAvailable = /delivery is available|delivery available/i.test(transcript);
  if (!/in stock|available|out of stock|not available/i.test(transcript)) needsConfirmation.push("availability");
  if (!quantityAvailable) needsConfirmation.push("quantity");
  if (!priceInr) needsConfirmation.push("price");
  if (!/delivery/i.test(transcript)) needsConfirmation.push("delivery availability");
  return { medicineName, available, quantityAvailable: quantityAvailable || undefined, priceInr, deliveryAvailable: /delivery/i.test(transcript) ? deliveryAvailable : undefined, needsConfirmation };
}
