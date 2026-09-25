# Cycle Notes

## Run locally

Use Node.js 22.13 or newer. Run `npm ci`, then `npm run dev` and open <http://127.0.0.1:4173>. Local development continues to use the existing loopback Node/SQLite service.

## Render + Supabase deployment

The hosted entry point is `server-supabase.js`; `render.yaml` builds the React client and serves it from the Node web service. Hosted auth uses Supabase Auth, tracker records are protected by owner-only RLS policies, and share/reminder/audit tables are reachable only with the server secret. The hosted build disables health-record storage in browser `localStorage`.

1. Create a Supabase project in the region appropriate for the intended users. In its SQL Editor, run `supabase/setup.sql`.
2. In Supabase Auth URL Configuration, set the Site URL to the Render service origin, add that origin to allowed redirects, and configure production email delivery/verification. Password recovery redirects to `/?recovery=1` on that same origin.
3. Connect this repository to Render as a Blueprint using `render.yaml`. Use a paid, always-on web-service plan for a real-user launch. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `APP_ORIGIN` in Render’s secret environment-variable UI. Never commit or expose the secret key in browser code.
4. Wait for `/api/health` to pass, create a test account, and verify signup confirmation, sign-in, owner-isolated sync, export, share expiry/revocation, account deletion, and recovery email delivery before inviting users.

The new Supabase database starts empty. Existing records in `.data/tracker.sqlite` or browser storage are not uploaded automatically; export them first and only migrate them with the account owner's explicit consent. Keep local data backups separately.

## Launch limitations

This repository is a product prototype, not a clinical service. Before accepting real health records, complete a security review, restore test, abuse/rate-limit monitoring, a privacy notice and deletion/retention process, incident response, and jurisdiction-specific legal review. Do not claim regulatory compliance based on the current implementation alone. Browser medication reminders operate only while the app is open.

