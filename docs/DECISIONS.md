# Decisions

## 2026-10-19 · Same service type twice on one day
Configurable per parish, per service type, with `service_types.max_per_day` (default 1). `service_events` gets an `occurrence` number, and the unique key and import duplicate check become (parish, service type, date, occurrence). With the default of 1, nothing changes for parishes that don't need it.

## 2026-10-19 · Backfilling past services
No fixed backfill start date per parish. Users can add or import a record for any past date, Sunday or midweek. The date picker highlights scheduled dates with no verified report. The reports list shows "No record" gaps within a date range the user picks, defaulting to the last 12 weeks. A date with a draft or unverified report is not a gap; it shows that report's status instead.

## 2026-10-19 · Authentication without Auth.js
Auth.js's password login only works with token sessions, but the spec asks for database sessions. I wrote a small session layer instead: random tokens in an http-only cookie, stored hashed (SHA-256) in a `sessions` table, 30-day sliding expiry. Passwords use Argon2id. Magic links are single-use, hashed, and expire in 15 minutes. Email delivery is stubbed to the server log in v1.

## 2026-10-19 · Tailwind 4 tokens live in CSS
Tailwind 4 has no `tailwind.config.ts`; the brand tokens from §8.1 are CSS variables in `app/globals.css` and exposed as utilities (`bg-brand`, `text-danger-text` …).

## 2026-10-19 · SheetJS from its own CDN
The `xlsx` package on npm is stale and has known vulnerabilities. It is installed from cdn.sheetjs.com (0.20.3) instead.

## 2026-10-19 · Ports and databases
Local Postgres runs on port 5433 to avoid clashing with any other Postgres. Unit/integration tests use `crm_test`, end-to-end tests use `crm_e2e`; both are rebuilt and seeded on every run.

## 2026-10-19 · Schema additions beyond the spec
- `members.phone` is nullable: required for adult first-timers in the form, but children and family members sharing a phone can be stored without one.
- `members.client_id`, `attendance_checkins` idempotency and `tasks.dedupe_key` / `outbound_messages.dedupe_key` make offline sync and daily jobs safe to repeat.
- `service_types.location` for the service cards on the Count screen.
- `service_events.import_batch_id` records which import created an event, so undo removes only what it created.
- `service_reports.drafted_by` is nullable because a tally-sourced report exists before anyone saves it; `submitted_by` added for the audit trail.
- `tasks.assigned_by` is nullable for system-created follow-up tasks.
- `parishes.follow_up_lead_user_id` for Day-3 call tasks.
- `import_rows.resolution` is `jsonb` (one choice per issue) rather than text.

## 2026-10-20 · Offline items belong to the person who queued them
Each outbox item on a phone records the user who created it, and the sync loop only sends the signed-in user's items. Without this, on a shared phone usher B could sync usher A's unsent counts under B's name. Signing out warns when items are still waiting, leaves them on the phone and clears cached pages, so the next person can't read the previous user's screens.

## 2026-10-20 · Rate limits
Sign-in: 10 attempts per minute per IP and per account (configurable with `LOGIN_RATE_LIMIT`; the E2E server raises it). Magic links: 5 per 10 minutes per IP. Sync: 120 batches per minute per user. Imports: 30 uploads per 10 minutes per user. In-memory, single instance.

## 2026-10-20 · pnpm pinned to 10.34.7
`packageManager` is pinned so local and Docker installs match. pnpm 11 refuses packages younger than 24 hours (`minimumReleaseAge`), which broke the Docker build with a freshly resolved lockfile.

## 2026-10-20 · Deployment shape
One Docker image runs the web app and the pg-boss worker. `docker-compose.prod.yml` adds Postgres 16, Caddy (automatic HTTPS) and a nightly `pg_dump` container. Migrations run when the web container starts. See docs/DEPLOY.md.

## 2026-10-20 · Not verified by an automated check
Lighthouse "installable" and the LCP < 2.5 s target on Fast 3G were not run in CI. The manifest, icons, service worker and offline reload are covered by tests. Run Lighthouse against a deployed build before launch.
