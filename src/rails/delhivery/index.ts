import type { RailAdapter } from "@/lib/rail-types";

export const delhiveryRail: RailAdapter = {
  id: "delhivery",
  displayName: "Delhivery",
  description: "Delivery creation, tracking, and status updates.",
  tools: [
    { id: "delhivery.standardize_care_address", name: "Standardize care address", description: "Standardizes and validates an informal care address." },
    { id: "delhivery.rank_suitable_labs", name: "Rank suitable labs", description: "Ranks supplied available labs by distance and price." },
  ],
};

export type { DeliveryRequest, DeliveryStatus } from "./types";
export { rankSuitableLabs, standardizeCareAddress } from "./location";
