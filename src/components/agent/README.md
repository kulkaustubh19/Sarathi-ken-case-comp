# Agent components

`Chatbot.tsx` opens automatically from the shared app shell. It guides fixed-OTP signup and login through `/api/auth`, then accepts natural-language requests. `/api/chat` handles member navigation, authorized record availability checks, and Calendar task discovery with server-side allowlisted routes; other replies go through Groq with a strict Sarathi scope and prompt-injection protections. Activity events are redacted, per-user, local-only, and expire after two hours. Voice remains out of scope. Setup is documented in `docs/chatbot-setup.md`.
