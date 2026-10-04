import { tracedPartnerFetch } from "@/lib/server/partner-trace";
import type { AddressValidation, CareAddress, GeoPoint, LabDistance, LocationSource } from "@/lib/types";

type DistanceTarget = { id: string; location: GeoPoint };

export interface DelhiveryMapsAdapter {
  readonly source: LocationSource;
  standardizeAddress(rawAddress: string): Promise<Pick<CareAddress, "formattedAddress" | "components">>;
  validateAddress(rawAddress: string): Promise<AddressValidation>;
  geocodeAddress(rawAddress: string): Promise<GeoPoint | undefined>;
  calculateDistances(origin: GeoPoint, labs: DistanceTarget[]): Promise<LabDistance[]>;
}

const hasPin = (address: string) => /\b\d{6}\b/.test(address);
const hasCity = (address: string) => /\b(bengaluru|bangalore|delhi|gurgaon|gurugram|mumbai|pune|hyderabad|chennai|kolkata)\b/i.test(address);
const hasPremise = (address: string) => /\b(flat|house|plot|building|floor|block|villa|apartment|apt)\b/i.test(address);
const inferredMissingFields = (address: string) => [hasPremise(address) ? "" : "house or building", hasCity(address) ? "" : "city", hasPin(address) ? "" : "pincode"].filter(Boolean);
const radians = (value: number) => value * Math.PI / 180;
export function kilometersBetween(a: GeoPoint, b: GeoPoint): number { const earth = 6371; const dLat = radians(b.lat - a.lat); const dLng = radians(b.lng - a.lng); const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2; return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); }
function titleCase(value: string): string { return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function stablePoint(value: string): GeoPoint { const hash = [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17); return { lat: 12.966 + (hash % 90) / 10000, lng: 77.59 + ((hash >>> 8) % 90) / 10000, errorRadiusMeters: 180 }; }

export class DemoDelhiveryMapsAdapter implements DelhiveryMapsAdapter {
  readonly source = "demo" as const;
  async standardizeAddress(rawAddress: string) { const value = rawAddress.trim(); return { formattedAddress: titleCase(value.replace(/\s+/g, " ")), components: { landmark: /hanuman mandir/i.test(value) ? "Hanuman Mandir" : "", locality: /sbi atm/i.test(value) ? "Second lane after SBI ATM" : "", pincode: value.match(/\b\d{6}\b/)?.[0] ?? "", city: value.match(/bengaluru|bangalore|delhi|gurgaon|gurugram|mumbai|pune|hyderabad|chennai|kolkata/i)?.[0] ?? "" } }; }
  async validateAddress(rawAddress: string): Promise<AddressValidation> { const missingFields = inferredMissingFields(rawAddress); return missingFields.length ? { quality: "not_ok", missingFields, reason: `Add ${missingFields.join(", ")} before this can be used for care logistics.`, confidence: "low", granularity: "DEMO" } : { quality: "ok", missingFields: [], reason: "Address is complete enough for the prototype’s location workflow.", confidence: "medium", granularity: "DEMO" }; }
  async geocodeAddress(rawAddress: string): Promise<GeoPoint | undefined> { return (await this.validateAddress(rawAddress)).quality === "ok" ? stablePoint(rawAddress) : undefined; }
  async calculateDistances(origin: GeoPoint, labs: DistanceTarget[]): Promise<LabDistance[]> { return labs.map((lab) => ({ labId: lab.id, kilometers: Number(kilometersBetween(origin, lab.location).toFixed(1)), source: this.source })); }
}

export class LiveDelhiveryMapsAdapter implements DelhiveryMapsAdapter {
  readonly source = "delhivery_maps" as const;
  constructor(private readonly token: string, private readonly runId?: string) {}
  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> { const response = await tracedPartnerFetch(this.runId, "Delhivery", `https://gateway-maps-pub-int.delhivery.com${path}`, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Delhivery Maps request failed (${response.status}).`); return response.json() as Promise<T>; }
  // The current public Delhivery Maps deployment exposes this endpoint with its documented deployed spelling.
  async standardizeAddress(rawAddress: string) { const data = await this.request<{ formatted_address?: string; address_components?: Record<string, string> }>("/standarize", { address: rawAddress }); return { formattedAddress: data.formatted_address ?? rawAddress, components: data.address_components ?? {} }; }
  async validateAddress(rawAddress: string): Promise<AddressValidation> {
    const data = await this.request<{ quality?: "ok" | "not_ok"; reason?: string; missing_fields?: string[]; granularity_level?: string }>("/validate", { address: rawAddress });
    const quality = data.quality === "ok" ? "ok" : "not_ok";
    const granularity = data.granularity_level;
    const confidence = quality === "ok" && granularity === "PREMISE" ? "high" : quality === "ok" && ["STREET_LANDMARK", "SUBLOCALITY_VILLAGE"].includes(granularity ?? "") ? "medium" : "low";
    return { quality, missingFields: data.missing_fields?.length ? data.missing_fields : quality === "not_ok" ? inferredMissingFields(rawAddress) : [], reason: data.reason ?? "Delhivery Maps validation completed.", confidence, granularity };
  }
  async geocodeAddress(rawAddress: string): Promise<GeoPoint | undefined> { const data = await this.request<{ lat?: number; lng?: number; error_radius?: number }>("/geocode", { address: rawAddress }); return typeof data.lat === "number" && typeof data.lng === "number" ? { lat: data.lat, lng: data.lng, errorRadiusMeters: data.error_radius } : undefined; }
  async calculateDistances(origin: GeoPoint, labs: DistanceTarget[]): Promise<LabDistance[]> { return labs.map((lab) => ({ labId: lab.id, kilometers: Number(kilometersBetween(origin, lab.location).toFixed(1)), source: this.source })); }
}

export function getDelhiveryMapsAdapter(runId?: string, demo = false): DelhiveryMapsAdapter { return !demo && process.env.DELHIVERY_MAPS_TOKEN ? new LiveDelhiveryMapsAdapter(process.env.DELHIVERY_MAPS_TOKEN, runId) : new DemoDelhiveryMapsAdapter(); }
