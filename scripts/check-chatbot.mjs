import assert from "node:assert/strict";

// Run against a local prototype server. Creates one synthetic test profile.
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const jar = new Map();
async function call(route, body, expected = 200, origin = base) {
  if (body?.mode === "signup") body = { user_name: "Prototype Test User", storage_consent: true, drive_folder_url: "", ...body };
  const response = await fetch(`${base}${route}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
const phone = `+919${String(Date.now()).slice(-9)}`;
const email = `prototype-${Date.now()}@example.com`;
const initial = await call("/api/auth");
assert.equal(initial.user, null);
await call("/api/chat", { message: "Hi" }, 401);
await call("/api/auth", { action: "verify-otp", otp: initial.otp }, 401);
await call("/api/auth", { action: "request-otp", mode: "signup", phone: "bad", email }, 400);
await call("/api/auth", { action: "request-otp", mode: "signup", phone, email: "bad" }, 400);
await call("/api/auth", { action: "request-otp", mode: "login", phone }, 404);
await call("/api/auth", { action: "request-otp", mode: "signup", phone, email }, 403, "https://other.example");
const signup = await call("/api/auth", { action: "request-otp", mode: "signup", phone, email });
await call("/api/auth", { action: "verify-otp", otp: "incorrect" }, 401);
assert.equal((await call("/api/auth", { action: "verify-otp", otp: signup.otp })).registered, true);
assert.equal((await call("/api/auth")).user, null, "Signup must require a separate login");
await call("/api/auth", { action: "request-otp", mode: "signup", phone, email: "other@example.com" }, 409);
await call("/api/auth", { action: "request-otp", mode: "login", phone });
const login = await call("/api/auth", { action: "verify-otp", otp: signup.otp });
assert.equal(login.user.email, email);
assert.equal((await call("/api/auth")).user.id, login.user.id);
await call("/api/chat", { message: "" }, 400);
const session = jar.get("care-session");
jar.set("care-session", `${session}tampered`);
await call("/api/chat", { message: "Hi" }, 401);
jar.set("care-session", session);
await call("/api/auth", { action: "logout" });
assert.equal((await call("/api/auth")).user, null);
await call("/api/chat", { message: "Hi" }, 401);
console.log("PASS: signup, validation, wrong OTP, separate login, duplicates, session persistence, tamper rejection, origin checks, chat authorization and logout.");
