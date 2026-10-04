export type FamilyRole = "patient" | "coordinator" | "caregiver" | "viewer";

export interface FamilyMember {
  id: string;
  name: string;
  role: FamilyRole;
}

export interface Permission {
  id: string;
  memberId: string;
  grantedToMemberId: string;
  scope: string;
}

export interface CareTask {
  id: string;
  memberId: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
}

export interface Approval {
  id: string;
  taskId: string;
  requestedFromMemberId: string;
  status: "pending" | "approved" | "declined";
}

export interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  occurredAt: string;
}

export type CallStatus = "idle" | "in_progress" | "completed" | "failed" | "cancelled";
export type CallUseCase = "lab_inquiry" | "pharmacy_inquiry";

export interface VoiceCall {
  id: string;
  useCase: CallUseCase;
  status: CallStatus;
  startedAt: string;
  completedAt?: string;
}

export interface TranscriptTurn {
  id: string;
  speaker: "assistant" | "staff";
  text: string;
  audioDataUri?: string;
  source: "script" | "gnani_stt";
}

export interface LabInquiryResult {
  testName: string;
  available?: boolean;
  earliestSlot?: string;
  preparation?: string;
  fastingHours?: number;
  priceInr?: number;
  needsConfirmation: string[];
}

export interface PharmacyInquiryResult {
  medicineName: string;
  available?: boolean;
  quantityAvailable?: number;
  priceInr?: number;
  deliveryAvailable?: boolean;
  needsConfirmation: string[];
}

export type LocationSource = "demo" | "delhivery_maps";
export interface GeoPoint { lat: number; lng: number; errorRadiusMeters?: number }
export interface AddressValidation { quality: "ok" | "not_ok"; missingFields: string[]; reason: string; confidence: "high" | "medium" | "low"; granularity?: string }
export interface CareAddress { rawAddress: string; formattedAddress: string; components: Record<string, string>; validation: AddressValidation; location?: GeoPoint; source: LocationSource; confirmedAt?: string }
/** A provider supplied by the user now; future discovery can populate the same shape. */
export interface LabCandidate { id: string; name: string; address: CareAddress }
export interface LabDistance { labId: string; kilometers: number; source: LocationSource }
export interface LabRecommendation { selected?: LabCandidate & { distanceKilometers: number }; ranked: Array<LabCandidate & { distanceKilometers: number }>; unverified: LabCandidate[]; rationale: string; source: LocationSource }
