import assert from "node:assert/strict";
import test from "node:test";
import { DemoDelhiveryMapsAdapter } from "./maps";
import { rankSuitableLabs, standardizeCareAddress } from "./location";

test("landmark-only address asks only for missing care-location fields", async () => { const address = await standardizeCareAddress("Near Hanuman Mandir, second lane after SBI ATM"); assert.deepEqual(address.validation.missingFields, ["house or building", "city", "pincode"]); assert.equal(address.location, undefined); });
test("complete Indian address receives a repeatable demo geocode", async () => { const address = await standardizeCareAddress("Flat 4B, Indiranagar, Bengaluru 560038"); assert.equal(address.validation.quality, "ok"); assert.ok(address.location); });
test("lab ranking verifies manual lab addresses and excludes incomplete ones", async () => { const address = await standardizeCareAddress("Flat 4B, Indiranagar, Bengaluru 560038"); const result = await rankSuitableLabs(address, ["Building 1, Indiranagar, Bengaluru 560038", "Flat 2, Domlur, Bengaluru 560071", "Near temple"]); assert.equal(result.ranked.length, 2); assert.equal(result.unverified.length, 1); assert.equal(result.selected?.id, result.ranked[0].id); });
test("demo distance calculation is stable", async () => { const adapter = new DemoDelhiveryMapsAdapter(); const point = { lat: 12.97, lng: 77.6 }; const first = await adapter.calculateDistances(point, []); assert.deepEqual(first, []); });
