import { db, eq } from "./database";
import { ApiError } from "./prototype-auth";
export const hostedStorage = () => process.env.HEALTHNEST_DATA_MODE === "supabase" || Boolean(process.env.VERCEL);
const revisions = new WeakMap<object, number>();
export async function readHostedState<T extends object>(key: string, fallback: T): Promise<T> {
  const row = (await db<{ payload: T; revision: number; expires_at?: string }>("sarathi_demo_state", `?key=eq.${eq(key)}&limit=1`))[0];
  const value = row && (!row.expires_at || Date.parse(row.expires_at) > Date.now()) ? row.payload : fallback;
  revisions.set(value, row?.revision || 0); return value;
}
export async function writeHostedState(key: string, value: object, expiresAt?: string) {
  const result = await db<{ applied: boolean }>("rpc/sarathi_write_state", "", { method: "POST", body: JSON.stringify({ state_key: key, expected_revision: revisions.get(value) || 0, next_payload: value, expiry: expiresAt || null }) });
  const applied = Array.isArray(result) ? result[0]?.applied : (result as unknown as { applied: boolean }).applied;
  if (!applied) throw new ApiError("Another update arrived. Retry this operation.", 409);
}
export async function retryState<T>(fn: () => Promise<T>) { for (let attempt = 0; ; attempt++) { try { return await fn(); } catch (error) { if (!(error instanceof ApiError) || error.status !== 409 || attempt >= 4) throw error; } } }
export async function hostedFile(storagePath: string, bytes?: Buffer, mime = "application/octet-stream") {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ApiError("Configure Supabase for hosted demo storage.", 503);
  const headers = new Headers({ Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY });
  const key = storagePath.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
  if (bytes) { headers.set("Content-Type", mime); headers.set("x-upsert", "true"); }
  const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/sarathi-demo/${key}`, { method: bytes ? "POST" : "GET", headers, ...(bytes ? { body: new Uint8Array(bytes) } : {}), cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new ApiError("Hosted document storage failed. Run the Vercel demo migration and check the private sarathi-demo bucket.", 503);
  return bytes ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
}
