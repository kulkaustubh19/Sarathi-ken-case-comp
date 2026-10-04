# Sarathi demo submission

Prepared 4 October 2026. The story below is a proposed recording script with fictional people. Replace the recording date/name if needed. The actual decision times, inputs and outcomes come from Activity exports after your recording; the story is not evidence of live appointments or provider responses.

## Person's story (under 100 words)

On 4 October 2026, Priya Rao opens Sarathi and signs in with the prototype OTP. She sees her records and Rohan’s shared records. She says, “Show Rohan’s reports,” and the agent opens only records she can access. She uploads a prescription; an “Order medicines” task appears. She asks for nearby labs, verifies the demo addresses and selects a lab. “Book a blood test,” she says. Sarathi opens voice inquiries automatically, runs the Gnani simulation, then saves the successful demo booking to local Care Tasks. Finally, she asks for a doctor-visit brief, accepts the privacy consent, and sees a recent-first summary. Activity shows the steps she can export.

## 1. Decisions in recording order

Open `/activity`, clear your own old trace before starting, complete one scenario, refresh, and choose **Export decisions**. The Markdown export lists each actual decision with its UTC and India timestamp, triggering input, connector and underlying source, selected action, rule/reason, actual message/action, recipient and channel. **Export JSON** includes the complete ordered timeline, matched request/response call IDs, and individual run IDs.

Use those exported entries for the submission. No video or final recording has been supplied, so timestamps or successful partner responses should not be invented. A source is identified as browser input, owner-authorized local data, a scripted operator response, an actual signed Twilio callback, or a partner REST response.

Expected choices in this suggested recording:

1. Accept the matching prototype OTP and privacy consent; issue a ten-minute signed session. The OTP value and cookie stay out of the trace.
2. Show only the signed-in owner's and currently authorized shared demo repository counts.
3. Resolve “Show Rohan’s reports” against accessible local records. Route to the matching records; offer an invitation if none are accessible.
4. On a Prescription upload, save the local file and add an “Order medicines” static task. On a Medical Report upload, add a “Blood test” static task. These are templates, not inferred clinical orders.
5. On a nearby-lab request, open Location Intelligence at Fetch verified labs. Store only accepted candidates for that authenticated user. Ask the person to choose; retain their choice for this short session. On “Book a blood test with [verified lab],” stage a booking and open Voice inquiries. Automatically run the in-app Gnani simulation, then create one local Care Tasks event only if availability and the supported template slot are confirmed. Concurrent retries share one simulation and completed retries return the same task. A failed voice request creates no booking.
6. An explicit booking starts the in-app voice simulation automatically on the voice screen; no automatic telephone call occurs. After an explicit simulation click, select the lab or pharmacy script, synthesize both turns, transcribe the scripted staff turn, and extract supported facts. Record missing fields for confirmation rather than inventing them.
7. Only after explicit visit-brief consent, read up to the 20 most recent accessible documents transiently, redact identifiers locally, pass the remaining clinical content to Groq, and prioritize recent dates. Follow-up data/trace retention is two hours; task events remain.

The chatbot system policy governs scope, privacy, access and truthful action reporting. Voice parsing, address ranking and document-to-task templates also use deterministic application rules; the trace identifies their actual rules rather than pretending all decisions came from an LLM prompt.

## 2. What the agent knows on day one

The developer supplies Sarathi's supported workflows, access checks, ten-minute session duration, redaction rules, two-hour temporary retention, fictional report/prescription templates, static task templates, and lab/pharmacy scripts through checked-in code. Environment settings supplied by the prototype owner configure providers; secrets are server-side and excluded from Git and exports.

It begins with no clinical knowledge of a real user. Signup supplies account details and consent. Local demonstration records are seeded separately for each account, including a fictional shared family repository. Uploads supply user-selected document bytes and metadata. Address inputs and confirmation come from the user; partner results arrive only after a real request. Groq supplies language generation, not verified booking authority. Current account storage can use Supabase; documents and task events are local. Google Drive and Google Calendar are future connections for this demo.

## 3. Exact rail endpoints and recorded payloads

Every configured rail call is captured individually by the partner trace, including unsuccessful HTTP responses and network failures. The export contains the actual URL, method, body fields, HTTP status and response. Credentials and common identifiers are redacted. Multipart audio/PDF is represented by filename, MIME type, byte length and SHA-256; binary bytes are omitted. This is a privacy-preserving evidence export, not an unredacted network capture. Review it before submission.

### Gnani

- `POST https://api.vachana.ai/api/v1/tts/inference`: JSON containing `text`, `voice: "Kaveri"`, `model: "timbre-v2.5"`, `language: "en-IN"`, `speed: 1`, and WAV mono PCM `audio_config` at 48000 Hz, 2-byte samples. Response is full audio; the export records its actual content type, length and hash. [Official TTS REST reference](https://docs.gnani.ai/api/TTS/tts-inference).
- `POST https://api.vachana.ai/stt/v3`: multipart `audio_file`, `language_code: "en-IN"`, `format: "transcribe"`. The actual JSON response, including transcript, is captured. [Official STT REST reference](https://docs.gnani.ai/api/STT/speech-to-text).

In simulation, the staff response is authored by Sarathi and synthesized by Gnani before transcription. It is not a real lab confirming stock, preparation or a slot. In a Twilio trial call, the opening voice comes from Gnani and the operator transcript comes from Twilio's speech callback, not Gnani STT. Twilio's outbound endpoint is `POST https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Calls.json`; it is a supporting transport, not one of the three competition rails.

### Delhivery Maps

- `POST https://gateway-maps-pub-int.delhivery.com/standarize`
- `POST https://gateway-maps-pub-int.delhivery.com/validate`
- `POST https://gateway-maps-pub-int.delhivery.com/geocode`

Each request is JSON `{ "address": "<user-supplied Indian address>" }`; exports preserve the actual fields and response. These are the deployed paths, including the spelling `standarize`. [Official API reference](https://www.delhivery.com/maps/reference).

Lab comparison runs these calls for three user-supplied lab addresses. Distances are currently calculated locally using Haversine straight-line distance. Do not claim a Delhivery route/distance-matrix call, driving time, lab availability, medical suitability or an appointment reservation.

### Pine Labs / Setu eSign

Configured sandbox base: `https://dg-sandbox.setu.co` (production: `https://dg.setu.co`). The implementation supports:

- `POST /api/documents`: multipart `name` plus consent PDF `document`; the returned document ID is required.
- `POST /api/signature`: JSON `documentId`, `redirectUrl`, sharing-consent `reason`, and `signers` containing identifier, display name, signer number and signature placement. Identifiers/signing links are sensitive and should be redacted in published evidence.
- `GET /api/signature/{id}`: verify request state and matching signed signer; a redirect success flag alone is insufficient.

[Official Setu eSign integration guide](https://docs.setu.co/data/esign/quickstart). Local prototype member access currently uses checkbox consent and does not invoke Setu eSign. Therefore the local demo must say **“No Pine Labs calls in this run.”** The adapter is instrumented for a future connected run; a fabricated successful signature must not be presented as evidence.

### Imagined capabilities

None are claimed in the current prototype. Google Calendar sync, real provider appointment reservation and medicine ordering remain future work, rather than undocumented partner endpoints.

## 4. Screens and conversations

Open `/healthnest-demo-mockups.html` for the labeled mockup gallery. It covers the landing/navigation screen; signup/login and session consent; OTP; persistent chat; documents and upload; document preview; incoming/outgoing member access and revoke controls; visit-brief consent/results; tasks; Gnani scripted voice conversation and separate trial call; Delhivery validation/lab comparison; address book; and Activity exports.

There is no WhatsApp channel. Local invitations/revocations do not send email. Local tasks do not send push notifications. A proposed email/notification and future Setu handoff are labeled as future concepts in the gallery. External Setu screens are owned by Setu and are not currently visited by the local member flow.

## 5. Agent readiness scores (prototype-builder assessment)

- **Gnani: 8/10.** Documented STT/TTS REST and streaming interfaces fit a voice tool loop; Sarathi still needs explicit telephony orchestration, turn control and confirmation of parsed facts. [Gnani API overview](https://docs.gnani.ai/api/introduction/introduction).
- **Delhivery Maps: 8/10.** Structured address quality and geocoding responses support deterministic logistics choices; a valid address does not establish healthcare availability or a bookable slot. [Delhivery reference](https://www.delhivery.com/maps/reference).
- **Pine Labs / Setu eSign: 7/10.** Document upload, signing links and status retrieval support a consent workflow; product onboarding and a human signing handoff are still required, and signature consent alone does not enforce document permissions. [Setu guide](https://docs.setu.co/data/esign/quickstart).

These scores are subjective integration assessments, not measured provider reliability ratings.

## Five-minute recording plan

- 0:00–0:35: show login consent and prototype OTP; begin with a cleared Activity trace.
- 0:35–1:20: ask for shared records; show varied recent/older reports and prescription history.
- 1:20–2:00: upload a local sample prescription; show the generated “Order medicines” task.
- 2:00–2:35: ask for nearby labs, verify supplied demo candidates and select a lab.
- 2:35–3:35: say “Book a blood test with [selected lab]”; show automatic navigation/simulation, disclosure/reply, the completion message, the saved local task, and exact rail trace.
- 3:35–4:25: request the visit brief; show explicit redaction consent and recent-first findings. Fast-forward waits only.
- 4:25–5:00: refresh Activity and export decisions/JSON. Explain that real bookings, email, Setu signing and Google Calendar are not part of this local run.

Use synthetic records exclusively. Export while the authenticated session is active and before the trace expires. Your downloaded export is kept by you; automatic two-hour cleanup applies to Sarathi's temporary local trace and follow-up data, not that manually exported file or the task events.
