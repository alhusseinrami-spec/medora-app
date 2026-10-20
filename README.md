# Medora Command Center

The executive assistant for Medora Care (medical and laboratory supplies, Beirut). This is **Phase 1: Executive Foundation**: a real, working web app with sign-in, an executive dashboard, an AI assistant, tasks, calendar, contacts, reminders, an Approval Center and an audit log, all stored in PostgreSQL.

Nothing in this app is simulated. Services that arrive in later phases (Gmail, Google Calendar sync, the Medora CRM, WhatsApp) are listed under Settings → Connections with the phase they arrive in, and have no buttons until they work.

## What Phase 1 does

| Area | What you can do |
|---|---|
| Sign-in | First-run owner setup, email and password (Argon2id), two-step sign-in with any authenticator app (required for Owner and Admin), lockout after 5 failed attempts, sign out other devices |
| Dashboard | Needs-your-attention list (overdue tasks, approvals, meeting overlaps, due reminders), today's schedule, due-today tasks with quick add, 7-day task chart with table view, reminders, approvals. Panels can be hidden and reordered per person |
| Assistant | Chat in a side panel (Ctrl J) or full screen. Reads your real tasks, calendar, contacts and reminders; adds tasks, entries, contacts and reminders when asked; anything consequential goes to the Approval Center. Replies in English, Arabic or French. Conversations are saved |
| Tasks | Board with drag and drop (mouse, touch and keyboard) and a list view; priorities, due dates, notes, assignment to teammates (Manager and up) |
| Calendar | Month and week views in your time zone (Beirut by default), overlap warnings, link an entry to a contact |
| Contacts | Customers, suppliers, staff and partners with search, tags, notes, and call / email / WhatsApp links |
| Reminders | Set for any date and time; the background worker delivers them to the notification bell and, if you allow it, as desktop alerts while the app is open. Snooze, done, dismiss |
| Approval Center | Suggestion → Draft → Approved → Completed (or Rejected). Edit before approving. Each decision is recorded with who and when |
| Search | Ctrl K or / searches tasks, contacts, events and reminders and runs commands |
| Settings | Profile and time zone, password, signed-in devices, the assistant's memory, connections, team and roles, audit log, data export, retention period, delete my data |
| Everywhere | Light and dark themes, phone and desktop layouts, keyboard shortcuts (press ?) |

## Field sales

Sales reps open **/field** on their phone (add it to the home screen). It has four tabs: **Today** (verified visits, approved sales this month, Log visit, today's route with Optimize order), **Map** (every client as a coloured pin by stage, tap for Check in or Open), **Pipeline** (Lead, Prospect, Customer, Churned, overdue follow-ups first) and **Orders**.

| Step | What happens |
|---|---|
| Add a client | The + button saves the client with the phone's GPS position. Clients are ordinary contacts with a stage, so they also appear under Contacts |
| Check in | Records time and GPS. **Verified** only when the phone was within 150 m of the client's saved pin with a fix better than 100 m. Reps can't move a saved pin; managers can |
| Take order / Request proforma | Picks products from the catalogue (price fills in) or free-text items. Every Owner and Accountant gets a notification |
| Accounting reviews | **Orders** in the Command Center: change quantities and prices (0 removes a line), save, approve or reject with a note. The rep is notified and sees what was changed |
| Follow-ups | Tomorrow, next week or any date; the reminder lands in the rep's bell and the client goes on Today's route |

Approved orders and proforma requests are then sent on to the accounting system: set `ACCOUNTING_WEBHOOK_URL` and `ACCOUNTING_WEBHOOK_SECRET` and each one is POSTed as JSON (client, rep, approved lines next to what the rep asked for, total), signed with `X-Medora-Signature: sha256=<HMAC of the body>` and carrying `Idempotency-Key: <order id>`. Failed sends retry with growing gaps for about a day, then accounting is notified and can press Send now. Until the URL is set, approved orders wait and go out once it is. The order page shows where each one stands.

Managers see **Field visits**: each rep's day with verified and unverified check-ins and orders. Accounting manages **Products and prices**. New role **Accountant** (two-step sign-in required) reviews orders; reps use the **Staff** role. The map uses OpenStreetMap tiles, the only outside resource the app loads.

## How the assistant is kept safe

- It can only call the tools in `src/lib/ai/tools.ts`. None of them sends anything outside the app, pays, changes financial data or commits to a purchase.
- Deleting records, assigning work to someone else and saving a preference can only be **proposed** (`propose_approval`). They run after a person approves them in the Approval Center, and only kinds with a real executor exist (`src/lib/services/approvals.ts`), so nothing can wait on an action that can't happen.
- It learns only from memory the user added or approved (Settings → Assistant memory). Anything there can be deleted.
- Every tool call is written to `execution_logs`, and every change to `audit_logs` with `actorKind = "ai"`.
- Tool inputs are validated (zod) before they run, and permissions are checked inside the services, so the assistant can never do more than the signed-in person.
- Model: `claude-opus-5-5` by default (`AI_MODEL` to change), called with the server-side fallback option so a busy model falls back automatically.

## Roles

| Role | Can |
|---|---|
| Owner | Everything, including approving any item and deleting any record |
| Admin | Manage users, view the audit log, company settings (not approvals) |
| Manager | See team tasks, assign work, decide approvals, see every rep's field visits |
| Staff | Their own workspace, and the field sales app for their own clients |
| Accountant | Review, edit, approve or reject orders and proformas; manage products and prices |
| Viewer | Sign in and look, no changes |

## Run it locally

Requirements: Node 20.9+ and PostgreSQL 14+.

```bash
cp .env.example .env              # fill in DATABASE_URL and APP_ENCRYPTION_KEY (openssl rand -base64 48)
npm install
npm run db:migrate                # creates the tables
npm run dev                       # http://localhost:3000, then follow the first-run setup
npm run worker                    # optional second terminal: delivers reminders every 30 s, runs nightly clean-up
```

Without `ANTHROPIC_API_KEY` everything works except the assistant, which says it isn't connected.

## Tests

```bash
npm run typecheck && npm run lint
npm test                          # 30 unit and service tests against a medora_test database
npm run test:e2e                  # 10 browser tests against a medora_e2e database
```

`TEST_DATABASE_URL` and `E2E_DATABASE_URL` override the test databases; both must contain "test"/"e2e" in the name or the suite refuses to run. Browser tests use a scripted stand-in for Claude (`AI_PROVIDER=mock`), which the app refuses to use in production. Set `PW_CHROMIUM` to a Chromium path if Playwright's own browser isn't installed.

What the browser tests cover: first-run setup and two-step sign-in, creating and dragging tasks with persistence, calendar month and week views, contacts with validation and search, a reminder delivered by the worker to the bell, the assistant creating a task and sending a memory to the Approval Center (then approving it with edits), the search palette, dashboard customisation, dark theme, data export without secrets, a cross-site request being refused, sign-out and sign-in with a code, and every page on a 390 px phone screen without sideways scrolling.

## Deploy

The chosen host is **Vercel** with **Neon** Postgres. Step-by-step instructions, including connecting Nour, are in [DEPLOY.md](DEPLOY.md).

On Vercel there is no always-on worker. The same jobs (`src/lib/jobs.ts`) run from Vercel Cron via `/api/cron/tick`, and also whenever the app is open, because the notification bell polls every 30 s. Self-hosting elsewhere still works: run `npm start` plus exactly one `npm run worker`, and set both database URLs to the same value.

`/api/health` reports the database and when scheduled jobs last ran. Logs are JSON lines on stdout.

## Architecture

```
Browser (Next.js React UI) ──► Next.js server (pages, server actions, /api routes)
                                   │  lib/auth      sessions, MFA, roles
                                   │  lib/services  tasks, events, contacts, reminders, approvals, search
                                   │  lib/ai        Claude tool loop + tool registry
                                   ▼
                               PostgreSQL (Prisma)  ◄── worker/ (reminders every 30 s, nightly retention)
                                   ▲
                               Claude API (server-side only; key never reaches the browser)
```

- `src/app/(auth)` sign-in, setup, two-step screens. `src/app/(app)` the signed-in app. `src/app/api` chat, search, notifications, export, health.
- `src/lib/services` hold all business rules and permission checks; screens, the assistant and the Approval Center all go through them.
- `prisma/schema.prisma` the full schema, including tables reserved for later phases (integration accounts, emails, documents, automation rules).
- `src/proxy.ts` sends visitors without a session to sign-in; every page and route still checks the session in the database.

## Security notes

- Passwords: Argon2id. Sessions: random 256-bit token, only its SHA-256 is stored; httpOnly, SameSite=Lax cookie; 7 days sliding; revocable per device.
- Two-step sign-in: RFC 6238 codes; the secret is encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`.
- Headers: Content-Security-Policy (self only), HSTS, X-Frame-Options DENY, nosniff, strict referrer policy.
- Cross-site requests: server actions use Next's origin check; JSON routes refuse other origins.
- The chat endpoint is rate-limited per person (20 a minute). The limiter is in memory, so with more than one web instance it should move to Postgres or Redis.
- Data export never includes password hashes, MFA secrets or tokens.

## Known limits of Phase 1

- Desktop alerts appear while the app is open in a tab; reminders also wait in the bell. Push notifications to a closed browser or phone arrive with the mobile work in a later phase.
- The calendar is the app's own; two-way Google Calendar sync is Phase 2.
- One company per installation.

## Roadmap

- **Phase 2:** Gmail and Google Calendar connections (OAuth, encrypted tokens), email summaries, AI drafts that wait for approval, meeting preparation, follow-up tracking.
- **Phase 3:** Medora CRM and accounting (read-only), reporting, customer intelligence, financial summaries, stock alerts.
- **Phase 4:** Workflow builder with trusted automations you configure, background monitoring, proactive recommendations, delegation.
- **Phase 5:** Research, executive memory, forecasting, voice, decision support, more integrations.

Each phase is finished and tested before the next starts.
