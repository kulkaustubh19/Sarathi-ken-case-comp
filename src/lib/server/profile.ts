import { ApiError, sessionUserId } from "./prototype-auth";
import { findUser } from "./login-store";

export function profileInput(body: Record<string, unknown>) {
  if (typeof body.user_name !== "string" || !body.user_name.trim() || body.user_name.trim().length > 100) throw new ApiError("Enter your name (up to 100 characters).");
  if (body.storage_consent !== true) throw new ApiError("Accept the repository storage terms to continue.");
  const url = typeof body.drive_folder_url === "string" ? body.drive_folder_url.trim() : "";
  if (url.length > 512) throw new ApiError("Use a Google Drive folder link of up to 512 characters.");
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new ApiError("Enter a Google Drive folder link, or leave it blank."); }
    if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" || !/^\/drive\/(?:u\/\d+\/)?folders\/[\w-]+/.test(parsed.pathname)) throw new ApiError("Enter a Google Drive folder link, or leave it blank.");
  }
  return { user_name: body.user_name.trim(), drive_folder_url: url || null };
}
export async function requireUser() {
  const id = await sessionUserId();
  const user = id ? await findUser("id", id) : null;
  if (!user) throw new ApiError("Your session expired. Please log in again.", 401);
  return user;
}
