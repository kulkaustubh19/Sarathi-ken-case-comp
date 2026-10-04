# Gnani and Delhivery integration

The feature code from the Agent_Harshita checkout is integrated into Sarathi as additional routes:

- /voice: Gnani scripted lab/pharmacy inquiry audio and optional Twilio trial calls.
- /location: Delhivery address validation and comparison of three supplied lab addresses.
- /address-book: the confirmed care address, stored in this browser under the signed-in account.

The existing document, member, task, authentication, and Pine Labs flows are retained. New user-facing APIs use Sarathi authentication and origin checks. Twilio webhooks retain signature validation; call transcripts are limited to the initiating account. Chat can navigate to the new screens without automatically placing a call.

Configure GNANI_API_KEY for speech, DELHIVERY_MAPS_TOKEN for live address services, and the TWILIO_* settings plus PUBLIC_BASE_URL for trial calls. Without the Delhivery token, deterministic demo address data is used. PUBLIC_BASE_URL must be a public HTTPS tunnel forwarding to this app on port 8080. The copied tunnel configuration may need updating if it previously forwarded to the separate checkout.

Phone calls are started only by the explicit trial-call button and target the configured demo recipient. No live calls are made by the test suite.

Validation: npm run typecheck; npm run test:repository; npm run test:rails. For HTTP regression checks against a running prototype, set TEST_BASE_URL and TEST_PHONE to an existing prototype account and run node scripts/check-merged-flows.mjs. This performs a prototype login and reads repositories; it does not create a new account or place provider calls.


Activity now records individual partner endpoint requests/responses with matched call IDs, redacted JSON and binary size/hash metadata. Export decisions or JSON from /activity within two hours. The submission draft is docs/demo-submission.md and the labeled mockup gallery is /healthnest-demo-mockups.html.
