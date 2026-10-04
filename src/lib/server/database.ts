import { ApiError } from "./prototype-auth";

export async function db<T>(table: string, query = "", init?: RequestInit): Promise<T[]> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ApiError("Connect Supabase to use the document repository.", 503);
  const headers = new Headers(init?.headers);
  headers.set("apikey", process.env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Prefer")) headers.set("Prefer", "return=representation");
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${query}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    if (["PGRST205", "PGRST204", "42703", "PGRST202"].includes(details.code)) throw new ApiError("Run the Sarathi database migrations, including 202610050005_vercel_demo.sql for hosted demo storage, in Supabase SQL Editor, then refresh.", 503);
    if (response.status === 409) throw new ApiError("This record already exists. Refresh and try again.", 409);
    if ([401, 403].includes(response.status)) throw new ApiError("Supabase denied access. Check the backend key and table permissions.", 503);
    throw new ApiError("Repository storage is temporarily unavailable.", 503);
  }
  if (response.status === 204) return [];
  return response.json();
}
export const eq = (value: string) => encodeURIComponent(value);
