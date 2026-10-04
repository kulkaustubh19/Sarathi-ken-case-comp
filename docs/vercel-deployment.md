# Deploy Sarathi from GitHub to Vercel

## Before pushing

The Next.js app root is `Agentic_Healthcare` if you push the enclosing Agent directory; use `.` if this repository itself is your GitHub repository root. Push the code and migrations, but never `.env.local`, `.data`, passwords, or API keys. `.gitignore` and `.vercelignore` exclude these files. Existing developer credentials must remain server-side; never prefix them with `NEXT_PUBLIC_`.

Run `supabase/migrations/202610050005_vercel_demo.sql` in your existing Supabase project's SQL Editor after the earlier login/documents migrations. It creates private hosted prototype storage, durable care tasks/member state, and a redacted event log. Hosted demo uploads use the private `sarathi-demo` bucket; Drive uploads still go to the user's Drive without a demo-storage copy. Enable Supabase Cron and run the cleanup schedule shown at the end of the migration to physically delete expired temporary traces and booking state. Expired traces are excluded from responses immediately; the scheduled job removes them within a minute. Ordinary documents and Calendar events are not part of that cleanup.

## Vercel settings

1. Import the GitHub repository into Vercel. Select Next.js, the app root above, and Node.js 22. Leave the output directory at its framework default. The repository includes `vercel.json` with the build command and API duration setting.
2. Open Project Settings → Environment Variables. `.env.local` remains only on your computer: Vercel does not receive it from GitHub. Copy its required values directly into Vercel's Production environment (and Preview only if you need previews). Do not put secrets in the build command or GitHub files.
3. Required variables: `AUTH_MODE=prototype`, `PROTOTYPE_OTP=123456`, `AUTH_COOKIE_SECRET` (at least 32 characters), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `HEALTHNEST_DATA_MODE=supabase`.
4. Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Groq: `GROQ_API_KEY`, `GROQ_MODEL`. Voice: `GNANI_API_KEY`. Labs: `DELHIVERY_MAPS_TOKEN` and your existing demo/live location setting. Setu: `SHARING_CONSENT_MODE=setu_esign`, `SETU_ESIGN_BASE_URL`, `SETU_CLIENT_ID`, `SETU_CLIENT_SECRET`, `SETU_PRODUCT_INSTANCE_ID`.
5. Email: `SMTP_USER` and `SMTP_PASS`. Use a Gmail **App Password**, not your ordinary password. Gmail must have two-step verification enabled. The app strips the spaces in grouped app-password displays. Invitation emails are sent when a member is added; access still waits for Setu consent and recipient acceptance. Revocation emails can be retried without restoring access.
6. Deploy. After Vercel provides the production URL, set `APP_URL=https://YOUR-PROJECT.vercel.app`, `PUBLIC_BASE_URL` to that same origin for enabled voice callbacks, and `SETU_REDIRECT_URL=https://YOUR-PROJECT.vercel.app/members` in Vercel. Redeploy so the runtime receives the new values. Do not retain localhost, example.com or an old ngrok address for public callbacks.
7. In Google Cloud → your Web OAuth client, register the exact authorized redirect `https://YOUR-PROJECT.vercel.app/api/google/callback`. If an authorized JavaScript origin is requested, use `https://YOUR-PROJECT.vercel.app`. Drive and Calendar use the same OAuth callback. While the OAuth application is in Testing, every authorizing Google account must be a registered test user. Update the matching Setu dashboard return URL to `/members` as well.

The code also detects the Vercel production hostname when APP_URL is absent. An explicit stable APP_URL is preferred, especially when using a custom domain. Register that exact domain with Google and Setu if you switch domains. Changing environment variables does not modify already running deployments: redeploy.

## Recording checks

Sign in and personally accept the updated storage/privacy notice. Try “I want to upload a report”, select a small synthetic file, fill patient/doctor/date, and save. “Show my documents” opens the library. “What’s my status today?” opens Overview and responds with task counts and action tiles. “Add a family member” opens Members and asks the name; the next reply pre-fills the invitation. “Remove a family member” opens Members, asks the name, and leaves final revocation to the − button. No chat text grants or removes access by itself.

On Vercel, uploads through this app are capped at 4 MB to stay below Vercel's 4.5 MB function payload limit. Local development retains the 25 MB limit. Use the supplied 1–2 plain-text sample documents per repository for the visit-brief demo. Vercel's Node runtime does not include the local Python/Poppler/Tesseract tools: selectable PDF extraction and image/scanned-PDF OCR remain available only where those local tools are installed. Hosted text/CSV reading uses in-process extraction and identifier redaction; unsupported analysis is reported rather than sending images to Groq.

Connect Google yourself before demonstrating Drive or actual Calendar sync. Provider reservations remain an explicitly scripted simulation; Calendar events are real only after a successful sync response. Local/Supabase member sharing does not grant Google Drive permissions. The Twilio trial phone-call transport still depends on an active long-running process and should be demonstrated locally; use the in-app Gnani simulation for the Vercel recording.

Gmail authentication was rejected during the final local setup check (`EAUTH`); replace the app password before recording email delivery. No real test email was sent. A failed email does not revoke or grant document access.

Run `npm run test:repository`, `npm run test:google`, `npm run test:hosted`, `npm run test:rails`, `npm run lint` and `npm run build` before pushing.

References: [Vercel function limits](https://vercel.com/docs/functions/limitations), [Supabase Cron](https://supabase.com/docs/guides/cron).
