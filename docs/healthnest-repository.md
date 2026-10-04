# Sarathi document repository

## Setup

1. Run `supabase/migrations/202610040002_healthnest_documents.sql` and then `supabase/migrations/202610040003_drive_session_tokens.sql` in the same Supabase project as `.env.local`. Run the original login migration first if needed. The third migration removes any previously stored Google refresh token.
2. Existing users can log in as before, then add their name and accept storage consent in Documents > Profile & terms. New signup asks name, mobile, email, optional folder link, storage consent and the fixed OTP. The account is created after verification, followed by a separate login.
3. In Google Cloud, enable Google Drive API and Google Calendar API, and configure the OAuth consent screen. Create a Web application OAuth client and register the exact redirect URI `http://localhost:8080/api/google/callback`. Add your testing accounts to the OAuth app's test-user list. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `APP_URL=http://localhost:8080`.
4. After login and consent, authorize Google Drive from Documents. Google authorization is requested for the active Sarathi login and lasts no longer than 10 minutes. A folder link does not provide authorization. Reauthorize after the session expires. The repository root can be created beneath the user's chosen private folder.
5. Live folder traversal and shared-repository summaries use the Google Drive `drive` scope; confirmed reminders use Google Calendar's `calendar.events` scope. Google shows both permissions during authorization. Add test accounts to the OAuth app's test-user list; Google verification requirements apply before making restricted-scope access available publicly. Reauthorize after adding/changing requested scopes.
6. To send emails from `kulkarnikaustubh172@gmail.com`, enable Gmail 2-step verification and generate a Gmail app password. Set `SMTP_USER=kulkarnikaustubh172@gmail.com` and `SMTP_PASS` to that app password, never the regular password. The sender is fixed to the requested account. Without credentials, emails are queued and the UI says so; Retry email attempts delivery later. Failed delivery never silently regrants access or undoes a revocation.
7. Restart after changing configuration. Keep `.env.local` private and ignored by Git. `AUTH_COOKIE_SECRET` (32+ characters) encrypts the short-lived Drive access token in an HTTP-only cookie. Sarathi does not retain a Google refresh token; login and Drive authorization expire after 10 minutes.

## Pine Labs consent integration

Pine Labs routes its eSign product through Setu. The API signs a sharing agreement; it does not enforce access permissions or store general medical files. Setu Account Aggregator is for financial data, not medical document sharing.

`SHARING_CONSENT_MODE=prototype` records explicit checkbox consent, exact terms, version and timestamp. It is clearly marked as **not an eSignature**. For Setu integration set `SHARING_CONSENT_MODE=setu_esign` and configure:

```
SETU_ESIGN_BASE_URL=https://dg-sandbox.setu.co
SETU_CLIENT_ID=...
SETU_CLIENT_SECRET=...
SETU_PRODUCT_INSTANCE_ID=...
SETU_REDIRECT_URL=https://your-public-app.example/members
```

Setu requires a public HTTPS redirect URL; localhost is not supported for that redirect. These credentials must be provisioned for the eSign product, not a Pine Labs payment API. Only the documented sandbox and production hosts are accepted. The integration produces a separate consent PDF containing the owner, recipient, scope, duration-until-revocation and agreement identifier. It uploads it, creates a signature request for the owner's Indian mobile, and returns the provider's signing URL. Users complete the provider flow themselves. **Check signature** polls Setu on the backend; access is granted only after the expected signer is signed and the request is `sign_complete`. A browser redirect's `success=true` is never trusted. The provider retains the signed agreement against the stored signature request ID; Sarathi stores the terms and verification timestamp, not a downloaded signed archive.

Sources: https://www.pinelabs.com/docs, https://docs.setu.co/data/esign/quickstart, https://docs.setu.co/data/esign/pdf-templating.

## Document and access behavior

- All non-empty file formats are accepted up to 25 MB. Google Drive controls which formats have a preview; unsupported files remain stored but cannot be previewed. There is no raw download/proxy endpoint in Sarathi.
- Upload collects type, Me/Others, patient name for Others, doctor, document date and optional city. Me uses the account name on the backend. Date defaults to today in India. Structure relative to the private repository root: `Patient/Year/Type/Type_Doctor_YYYY-MM-DD.extension`. Unsafe path characters are sanitized. Files with the same filename are separate Drive objects, never overwritten.
- Sharing applies to **all current and future documents** in the owner's Sarathi repository, including other patients. Owners must attest that they have authority to share. Per-document grants are not part of this version.
- Google folder grants are `reader` only. Every uploaded file is created with `downloadRestrictions.itemDownloadRestriction.restrictedForReaders=true`. Sarathi offers preview only, with no editing/download controls. Google Drive may ask the viewer to sign in. Screenshots and copying already-rendered content cannot be prevented.
- Incoming access and document summaries match the recipient's **Google-verified email**, not their freely typed signup email. Connect the Google account that received the invitation to see shared records.
- Removal blocks application access immediately, then deletes the Google reader permission. A Google failure leaves the row as `revoking`; clicking minus again retries. The notification is sent after successful Drive revocation. Existing loaded content or externally copied files cannot be recalled. Sarathi cannot control external permissions the owner adds directly in Google Drive.
- The minus control for incoming access lets a recipient leave that repository; it cannot revoke another recipient's grant. Only the owner can manage outgoing grants.
- Supabase tables have RLS and no client access. The server checks the signed session and ownership before reading or mutating records; Google tokens and direct permission IDs are not sent to the UI. Document requests recheck current grants.
- Refresh scans the current Drive folders and active shared repositories for live counts. Category and document links open the corresponding Google Drive folder or file in a new tab. The scan is capped at 3,000 folders per refresh; production should add pagination and background indexing for larger repositories.
- “Prepare doctor visit” reads up to 20 accessible medical reports, lab results, vaccination records and prescriptions in the current Google-authorized session. PDFs with a selectable text layer are extracted locally with `pdfplumber`; names, contact details, birth dates and common record identifiers are redacted in the app before de-identified text is sent to Groq, while age and sex may remain. This is best-effort pattern redaction, not guaranteed anonymization. Image and scanned-PDF OCR must run locally with Tesseract (`TESSERACT_PATH`) and Poppler (`PDFTOPPM_PATH`); if local OCR is unavailable, analysis fails closed and document images are never sent to Groq. User confirmation is required for visit preparation.
- Upload review extracts only follow-ups and medicine instructions explicitly present in supported documents after local text extraction and best-effort redaction. The user reviews the suggestions and confirms each Google Calendar event. Temporary follow-up suggestions and the local activity trace are cleared after two hours; reminders explicitly approved in Google Calendar remain there until removed. Blood-test events retain `[Lab name]` until filled in. Medication alarms are never invented: exact prescription times are required, and recurring events stop at an explicit end date when one is available.
- The Activity page records redacted inputs, provider calls/responses, and outbound messages in the local `.data/agent-run-events.json` file. Each entry has a two-hour expiry and the file is pruned on expiry while the local server is running; secrets, auth headers, access tokens, and original document bytes are omitted. Gnani and Delhivery adapters are placeholders and do not make external calls yet.
- Chat transcript and visit brief live only in the browser component state; Clear chat or logout removes them. They are not stored in Supabase. Calendar events are intentionally stored by Google Calendar after user confirmation.

## Verification and limits

Run `npm run typecheck`, `npm run lint`, `npm run build` and `node scripts/check-repository.cjs`. The repository check mocks Supabase, Drive, Gmail and Setu: it tests upload structure, live Drive scans, restriction metadata, Google identity matching, reader-only grants, unauthorized access, revocation, regrant, notification emails and eSign gating without contacting real providers.

For the local live signup smoke test, run `TEST_BASE_URL=http://localhost:8080 node scripts/check-chatbot.mjs` (PowerShell sets `$env:TEST_BASE_URL` first). It creates a synthetic login profile. Do not run against real deployments without intending to create that profile.

This remains a fixed-OTP prototype, not authentication suitable for real medical data. Provider calls cannot be fully verified without Google, Gmail and Setu credentials and the database migration. It has no malware scanning, distributed workflow locks, automatic email worker, audited signed-document archive, durable scheduled cleanup while the app is offline, or production authentication. Before production add real verified identity, workflow locking, provider reconciliation, OCR deployment, and email dispatch guarantees. Use the local synthetic demo records for demonstrations.

## Sarathi overview and signed local sharing (October 2026)

The application is now branded Sarathi. Internal storage filenames, environment-variable names and event names retain their existing identifiers for compatibility.

The Overview shows pending care tasks/appointments, tests and medicine replenishments for the current Monday–Sunday week in Asia/Kolkata. Uploaded documents, the two seeded documents per repository (one report and one prescription), and accessible shared documents are counted separately. Invitation cards report received invitations, invitations awaiting recipient acceptance, and owner signatures still pending. Stored future events are preserved; week filtering only changes their display.

Local sharing uses `SHARING_CONSENT_MODE=setu_esign` in `.env.local`. Review the disclosure before sending a consent PDF and signer details to Setu. The owner signs through the provider link and returns to Members to click **Check signature**. The backend verifies the matching signature request ID, `sign_complete`, and the expected signed signer before moving the invitation to `pending_acceptance`. Only the addressed signed-in recipient may accept it. Accepted grants allow view-only access to the owner's local repository; revocation blocks access immediately. No invitation or revocation email is sent in this local prototype. Historical demo-only access-list entries require new signed consent.

`SETU_REDIRECT_URL=https://example.com` is retained at the user's request. It is a placeholder: it will not bring users back to Sarathi. Return manually to `/members` after signing. Replace it with the app's public HTTPS `/members` URL when hosting or tunneling is available. A redirect success flag never authorizes access. Existing test credentials must be provisioned for the eSign product; integration code and mocked tests do not establish provider account eligibility or a completed live signature.

Reference: https://docs.setu.co/data/esign/quickstart
