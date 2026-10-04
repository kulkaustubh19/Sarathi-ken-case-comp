import { ApiError } from "./prototype-auth";

export function locationError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/\(429\)/.test(message)) return new ApiError("Delhivery has reached its request limit. Enable ‘Use Demo Maps for this prototype’ and retry, or try live Delhivery later.", 503);
  if (/\(401\)|\(403\)/.test(message)) return new ApiError("Delhivery rejected the configured token. Enable Demo Maps to continue locally, or update DELHIVERY_MAPS_TOKEN on the server.", 503);
  return new ApiError("Delhivery is unavailable. Enable ‘Use Demo Maps for this prototype’ and retry locally. For live access, check the server connection and Delhivery configuration.", 502);
}
