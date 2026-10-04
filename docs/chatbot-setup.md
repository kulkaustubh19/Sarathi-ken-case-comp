# Sarathi prototype chatbot

The chat opens automatically on every app route. Signup collects name, mobile, email, an optional Google Drive folder link, storage consent and a fixed prototype OTP. Successful signup creates a row in `public.login_users`, then asks the user to log in with their mobile number and the same OTP. Login opens the Documents and Members workflows; appointment booking is coming soon. Run the Supabase migrations in order and follow `healthnest-repository.md` for Drive, Gmail and Setu configuration.

## Connect your Supabase project

1. In Supabase, open SQL Editor, create a query, paste `supabase/migrations/202610040001_login_users.sql`, and run it.
2. Copy the Project URL from the project's Connect dialog or API settings.
3. Copy a server secret key from Settings > API Keys (a legacy `service_role` key is also supported). Do not use the public/publishable key for this backend.
4. Copy `.env.example` to `.env.local`, then enter `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never commit or share the server key.
5. Leave `AUTH_MODE=prototype` and `PROTOTYPE_OTP=123456`. Set `AUTH_COOKIE_SECRET` to a random value of at least 32 characters. It signs session/challenge cookies.
6. Restart the app after updating environment variables.

No Supabase Auth provider or SMS service is needed for this version. Phone and email ownership are **not verified**. The fixed OTP is deliberately shown in the interface. Use sample information, not real healthcare data. Row Level Security denies anonymous and authenticated client access to the login table; only the server uses the service key. Email is collected but is not a unique login identifier.

## Connect Groq

Create an API key at https://console.groq.com/keys and put it in `GROQ_API_KEY` in `.env.local`. `GROQ_MODEL` defaults to `openai/gpt-oss-20b`; check Groq's current model availability and developer-plan limits before changing it. Doctor-visit preparation extracts text in the app, applies best-effort local redaction, then sends only the redacted text after the user confirms; document images are never sent for model-based OCR. Configure `HEALTHNEST_PYTHON_PATH` with Python and `pdfplumber` for PDF text extraction. For scans and image documents, also configure local Poppler (`PDFTOPPM_PATH`) and Tesseract (`TESSERACT_PATH`); analysis fails closed if those are missing. Upload follow-up review also redacts locally before Groq. The Activity page shows redacted request/response traces, which expire and are pruned after two hours. Avoid real patient records in this fixed-OTP prototype.

Without a Groq key, authentication and the deterministic member, record-availability, document, and Calendar-task routes still work. Free-form replies are disabled. Rate-limit and provider errors leave these supported chat workflows available.

## Run and check

Install dependencies, then run `npm run dev`. The fixed code is `123456` unless changed in the environment. Test signup, wrong OTP, successful signup, login, menu options, reload and logout. Login and Google Drive authorization expire after 10 minutes; a new login and Drive authorization are required then. OTP challenges expire after five minutes.

Local development without Supabase writes accounts to ignored `.data/login-users.json`. This single-process store is for local development only. Supabase is mandatory when hosting; serverless local files are not durable. Existing local accounts are not automatically copied to Supabase.

Run `npm run typecheck`, `npm run lint` and `npm run build` before publishing. Hosting must run Next.js with server routes, not a static export. Add the same environment variables in the hosting provider's settings, including explicit `AUTH_MODE=prototype`, Supabase configuration, and a strong `AUTH_COOKIE_SECRET`. Use HTTPS for secure cookies.

This implementation intentionally does not provide real SMS OTP, Supabase Auth identities, production authentication, distributed abuse controls, clinical guidance, or booking. Replace fixed-OTP authentication before handling real accounts. No user records or conversational transcripts are committed to the repository.
