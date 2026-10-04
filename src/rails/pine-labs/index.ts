import type { RailAdapter } from "@/lib/rail-types";

/** Placeholder: Pine Labs payment capabilities will be registered here. */
export const pineLabsRail: RailAdapter = {
  id: "pine-labs",
  displayName: "Pine Labs",
  description: "Payment requests and delegated authorization.",
  tools: [],
};

export type { PaymentRequest, PaymentStatus } from "./types";

// Server-only integration; do not import from client components.
export { startConsent, consentComplete } from "./esign";
