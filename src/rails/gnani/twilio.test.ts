import assert from "node:assert/strict";
import test from "node:test";
import { buildCompletionTwiml, buildVoiceTwiml } from "./twilio";

test("trial call TwiML plays only the per-call Gnani audio and gathers speech", () => {
  const xml = buildVoiceTwiml("call-123", "https://example.ngrok-free.app");
  assert.match(xml, /<Gather input="speech"/);
  assert.match(xml, /https:\/\/example\.ngrok-free\.app\/api\/twilio\/audio\/call-123/);
  assert.match(xml, /callId=call-123/);
});

test("completion TwiML ends the call", () => {
  assert.match(buildCompletionTwiml(), /<Hangup\/>/);
});
