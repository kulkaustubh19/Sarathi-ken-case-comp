# Sarathi

Deployment: [GitHub → Vercel setup](docs/vercel-deployment.md). Hosted demo files and tasks use private Supabase storage; local development retains local uploads. Configure hosted secrets in Vercel Environment Variables, never in GitHub.

Your family care companion, across generations.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `src/app` — dashboard routes and app shell
- `src/components` — reusable visual components
- `src/lib` — shared types and rail contract
- `src/rails` — independent Gnani, Pine Labs, and Delhivery integration areas
- `src/data` — future local demo data

The app includes a prototype chatbot, fixed-OTP signup/login, Supabase user and document metadata, Google Drive document storage and previews, view-only member sharing and revocation, Gmail notifications, optional Setu/Pine Labs eSign sharing agreements, and Groq responses. Appointment booking remains a placeholder. Start with [chatbot setup](docs/chatbot-setup.md), then follow [repository setup](docs/healthnest-repository.md) for the new migration and provider credentials. Local signup can use a file-backed user store; document features require Supabase and Google Drive.

Local synthetic upload fixtures are in `.data/demo-records/` (six reports and six prescriptions). They are fictional and ignored by Git. The Activity page exposes the redacted local agent trace, which expires after two hours.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
