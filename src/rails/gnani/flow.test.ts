import assert from "node:assert/strict";
import test from "node:test";
import { createLabInquiryPlan, createPharmacyInquiryPlan, parseLabInquiryResult, parsePharmacyInquiryResult } from "./flow";

test("lab flow includes a consent disclosure and requested test", () => {
  const plan = createLabInquiryPlan({ testName: "HbA1c" });
  assert.equal(plan.useCase, "lab_inquiry");
  assert.match(plan.turns[0].text, /automated family-health assistant/i);
  assert.match(plan.turns[0].text, /HbA1c/);
});

test("lab parser extracts the supported structured fields", () => {
  const result = parseLabInquiryResult("HbA1c", "Yes, the HbA1c test is available. The earliest slot is tomorrow at 9:30 AM. Please fast for 10 hours before the test. The price is rupees 1,200.");
  assert.equal(result.available, true);
  assert.equal(result.earliestSlot, "tomorrow at 9:30 AM");
  assert.equal(result.fastingHours, 10);
  assert.equal(result.priceInr, 1200);
  assert.deepEqual(result.needsConfirmation, []);
});

test("lab parser flags missing fields for confirmation", () => {
  const result = parseLabInquiryResult("Vitamin D", "The test is available.");
  assert.deepEqual(result.needsConfirmation, ["earliest slot", "preparation instructions", "price"]);
});

test("pharmacy flow and parser capture stock, price, and delivery", () => {
  const plan = createPharmacyInquiryPlan({ medicineName: "Metformin 500 mg" });
  assert.match(plan.turns[0].text, /Metformin 500 mg/);
  const result = parsePharmacyInquiryResult("Metformin 500 mg", "Yes, Metformin is in stock. We have 12 strips available. The price is rupees 340 per strip, and delivery is available in the local area.");
  assert.equal(result.available, true);
  assert.equal(result.quantityAvailable, 12);
  assert.equal(result.priceInr, 340);
  assert.equal(result.deliveryAvailable, true);
  assert.deepEqual(result.needsConfirmation, []);
});

test("pharmacy parser does not claim availability from an out-of-stock response", () => {
  const result = parsePharmacyInquiryResult("Insulin", "Insulin is out of stock and delivery is not available.");
  assert.equal(result.available, false);
  assert.equal(result.deliveryAvailable, false);
  assert.deepEqual(result.needsConfirmation, ["quantity", "price"]);
});
