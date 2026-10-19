# agent.md — RCCG Parish & Zonal Church CRM (Web)

You are building a **web-based church management platform** for RCCG parishes, areas and zones. It runs in the browser on desktop and phones (responsive, installable as a PWA). There is no native mobile app in v1.

Read this whole file before writing code. When something here conflicts with your defaults, this file wins. When something is ambiguous, pick the simplest option consistent with this file, note it in `docs/DECISIONS.md`, and keep going.

---

## 1. Product in one paragraph

Ushers count attendance per sanctuary zone on their phones (even offline). Their tallies roll up into a **service report**: attendance + collections. The Head Usher drafts the report, the Parish Pastor verifies it, and it then counts toward Area and Zone totals. Parishes can also **enter past services by hand or import them from spreadsheets** (their history lives in Excel files today). Department heads run an **operations task board** for each service. Area and Zonal Pastors see a **zone overview**: attendance trends, retention of first-timers, and which parishes have reported, been verified and remitted.

## 2. Scope

### In v1 (build these)
1. Auth, users, roles scoped to the church hierarchy
2. Hierarchy admin: Region → Province → Zone → Area → Parish; sanctuary zones, service types, departments
3. **Headcount** (usher flow): choose service + zone → tally counter → register first-timers. Works offline.
4. **Service reports**: auto-assembled from tallies, collections entry, draft → submitted → verified → locked
5. **Backlog**: add a past service manually; **import past services from .xlsx/.csv** with column mapping, validation, review, commit and undo
6. **Operations board**: tasks per service/department with To do / In progress / For review / Done
7. **Zone overview** dashboard for Area/Zonal Pastors
8. Members & first-timers (basic profile, status, milestones) and the first-timer follow-up task generation (Day 3 call task)

### Not in v1 (leave hooks, don't build)
- WhatsApp/SMS sending (store message templates and a `outbound_messages` queue table; a stub sender logs to console)
- Remittance payment processing (show remittance status only; split percentages are config, entered by admins)
- Native apps, QR guest cards (keep a `qr_token` column on members for later)
- Province/Region/National dashboards beyond what the zone overview query gives for free

## 3. Tech stack (use exactly this unless blocked)

| Concern | Choice |
|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript (strict)** |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix) components, **lucide-react** icons |
| DB | **PostgreSQL 16** |
| ORM / migrations | **Drizzle ORM** + drizzle-kit |
| Auth | **Auth.js (NextAuth v5)**: email magic link + phone/password credentials. Sessions in DB. |
| Validation | **Zod** (shared between client and server) |
| Server mutations | Next.js **Server Actions** for forms; **Route Handlers** under `/api/v1/*` for the offline sync endpoint and import upload |
| Offline | **Serwist** (service worker / PWA) + **Dexie** (IndexedDB) outbox |
| Spreadsheet parsing | **SheetJS (xlsx)** on the server |
| Charts | **Recharts** |
| Background jobs | **pg-boss** (Postgres-backed queue — no Redis needed in v1) |
| Tests | **Vitest** (unit), **Playwright** (e2e, incl. mobile viewport 390×844) |
| Tooling | pnpm, ESLint, Prettier, Docker Compose for local Postgres |

Money is stored as **integer kobo (`bigint`)**, never floats. Display with `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`. All timestamps `timestamptz`; display in `Africa/Lagos`.

## 4. Repository layout

```
/app
  /(auth)/login
  /(app)/layout.tsx              # responsive shell: sidebar ≥768px, bottom tabs <768px
  /(app)/count/                  # headcount flow (service → tally → first-timer)
  /(app)/tasks/
  /(app)/reports/                # list, [reportId], new (past service)
  /(app)/reports/import/         # 4-step import wizard
  /(app)/zone/                   # zone overview
  /(app)/members/
  /(app)/admin/                  # hierarchy, service types, sanctuary zones, departments, users
  /api/v1/sync/route.ts          # offline outbox endpoint (idempotent)
  /api/v1/imports/route.ts       # file upload → parse
/components/ui                   # shadcn components
/components/app                  # app-specific components (TallyCounter, StatusPill, KpiTile…)
/lib/db/schema.ts                # Drizzle schema (source of truth)
/lib/db/queries/*                # scoped query helpers
/lib/auth/*                      # Auth.js config, role + scope helpers
/lib/offline/*                   # Dexie db, outbox, sync loop
/lib/import/*                    # parse, map, validate, commit, undo
/lib/money.ts, /lib/dates.ts
/jobs/*                          # pg-boss workers (follow-up tasks, overdue flags)
/drizzle/*                       # migrations
/tests/unit, /tests/e2e
/docs/DECISIONS.md
```

## 5. Data model

Write this in `lib/db/schema.ts` with Drizzle. Below is the intended Postgres shape. UUID primary keys everywhere (`gen_random_uuid()`), `created_at`/`updated_at timestamptz default now()` on every table (omitted below for brevity).

### 5.1 Hierarchy
```sql
regions   (id, name, code UNIQUE)
provinces (id, region_id → regions, name, code UNIQUE)
zones     (id, province_id → provinces, name, code UNIQUE)
areas     (id, zone_id → zones, name, code UNIQUE)
parishes  (id, area_id → areas, name, code UNIQUE, address, phone, email, is_active bool default true)
```
Pastors are **not** name strings. They are users with a role assignment (5.2).

### 5.2 Users, roles, scope
```sql
users (id, member_id → members NULL, name, email UNIQUE NULL, phone UNIQUE NULL, password_hash NULL, is_active)

role enum: USHER, HEAD_USHER, SECRETARY, HOD, TRIBE_LEADER, PARISH_PASTOR,
           AREA_PASTOR, ZONAL_PASTOR, PROVINCIAL_ADMIN, SYSTEM_ADMIN

scope_level enum: PARISH, AREA, ZONE, PROVINCE, REGION, GLOBAL

role_assignments (id, user_id → users, role, scope_level, scope_id uuid NULL,  -- NULL only for GLOBAL
                  department_id NULL, small_group_id NULL,  -- for HOD / TRIBE_LEADER
                  starts_on date, ends_on date NULL)
```
A user can hold several assignments, e.g. an HOD in one parish who is also an Area Pastor.

### 5.3 Members & milestones
```sql
member_status enum: FIRST_TIMER, NEW_CONVERT, REGULAR_MEMBER, WORKER, ORDAINED_MINISTER

members (id, parish_id, first_name, last_name, phone NOT NULL, whatsapp_phone NULL,
         email NULL, gender CHECK IN ('MALE','FEMALE') NULL, date_of_birth NULL, address NULL,
         status member_status default 'REGULAR_MEMBER', first_visit_on date NULL,
         consent_contact bool default false, qr_token text UNIQUE NULL)
  INDEX (parish_id), INDEX (phone)

milestone enum: WATER_BAPTISM, HOLY_GHOST_BAPTISM, BELIEVERS_CLASS, WORKERS_IN_TRAINING,
                SCHOOL_OF_DISCIPLES, RCBC
member_milestones (id, member_id, milestone, completed_on date NULL, UNIQUE(member_id, milestone))
```
Normalise phones to E.164 (`+234…`) on write. Duplicate check on (parish_id, phone) when registering first-timers. Warn and offer to merge, don't hard-block.

### 5.4 Parish setup
```sql
sanctuary_zones (id, parish_id, name, capacity int NULL, sort_order int)
departments     (id, parish_id, name, UNIQUE(parish_id, name))
department_memberships (id, department_id, member_id, role enum(MEMBER, EXCO, ASSISTANT_HOD, HOD), is_active)
small_groups    (id, parish_id, type_name default 'Tribe', name, address, landmark, leader_member_id, assistant_member_id NULL, custom_fields jsonb default '{}', is_active)
small_group_memberships (id, small_group_id, member_id, joined_on, is_active, UNIQUE(small_group_id, member_id))

recurrence enum: WEEKLY, MONTHLY_FIRST_FRIDAY, SPECIAL
service_types (id, parish_id, name, day_of_week int NULL, start_time time, recurrence, is_active,
               max_per_day smallint NOT NULL default 1 CHECK (max_per_day >= 1),  -- parish-configured, see 5.5
               UNIQUE(parish_id, name))
```

### 5.5 Services, tallies, reports
```sql
service_events (id, parish_id, service_type_id, event_date date, start_time time,
                occurrence smallint NOT NULL default 1,               -- 1st, 2nd… run of this type that day
                preacher text NULL, theme text NULL,
                UNIQUE(parish_id, service_type_id, event_date, occurrence))  -- also the import de-dupe key
```
Multiple services of the same type on one day are **configurable per parish, per service type**, via `service_types.max_per_day` (admin screen: "How many times can this service hold on one day?"). The server rejects `occurrence > max_per_day`. When `max_per_day = 1` the app never shows occurrence anywhere; when it is >1, pickers and labels show "{service} · 2nd" and the start time. Lowering `max_per_day` is blocked if existing events use a higher occurrence.
```sql

usher_assignments (id, service_event_id, sanctuary_zone_id, user_id, is_lead, checked_in_at NULL,
                   UNIQUE(service_event_id, user_id))

-- One row per usher per zone per service. Counts are ADDITIVE across ushers.
zone_tallies (id, service_event_id, sanctuary_zone_id, user_id,
              men int, women int, children int, first_timers int,
              client_id uuid UNIQUE NOT NULL,     -- generated on device; idempotency key
              client_updated_at timestamptz,      -- last-write-wins per (event, zone, user)
              UNIQUE(service_event_id, sanctuary_zone_id, user_id))

record_source enum: TALLY, MANUAL, IMPORT
report_status enum: DRAFT, SUBMITTED, VERIFIED, REOPENED

service_reports (id, service_event_id UNIQUE,
                 men int NULL, women int NULL, children int NULL,      -- NULL = unknown, NOT zero
                 first_timers int NULL, workers_on_duty int NULL,
                 offering_kobo bigint NULL, tithe_kobo bigint NULL, special_seed_kobo bigint NULL,
                 currency char(3) default 'NGN',
                 notes text NULL,
                 source record_source NOT NULL,
                 import_batch_id → import_batches NULL,
                 status report_status default 'DRAFT',
                 drafted_by → users, submitted_at NULL,
                 verified_by → users NULL, verified_at NULL)
```
Rules:
- `total_attendance` = men + women + children. If any component is NULL, the total is **unknown**: show "—" and exclude that report from averages. Never coerce NULL to 0 in aggregates. Use `COUNT(col)` and `AVG(col)` semantics.
- For `source = TALLY`, counts are recomputed from `zone_tallies` (SUM per field) whenever a tally syncs, **until** the report is SUBMITTED. Collections are typed by the Head Usher.
- VERIFIED reports are **locked**. Only HEAD_USHER or PARISH_PASTOR can move a report to REOPENED. Every change after that is written to `audit_log`.
- Only VERIFIED reports count in Area/Zone dashboards. Imported/manual reports show as "needs pastor check" until verified.

### 5.6 Individual attendance (for retention)
```sql
attendance_checkins (id, service_event_id, member_id, recorded_by → users, UNIQUE(service_event_id, member_id))
```
Registering a first-timer at a service also creates their check-in. The 30-day rule (§7.5) reads this table.

### 5.7 Backlog import
```sql
import_status enum: UPLOADED, MAPPED, VALIDATED, COMMITTED, UNDONE
import_batches (id, parish_id, uploaded_by → users, file_name, sheet_name, row_count,
                column_map jsonb, date_format text, options jsonb,
                status import_status, committed_at NULL, undone_at NULL, undone_by NULL)
import_rows (id, import_batch_id, row_number int, raw jsonb, parsed jsonb NULL,
             issues jsonb default '[]', resolution text NULL,
             outcome enum(READY, NEEDS_FIX, DUPLICATE, SKIPPED, IMPORTED) )
```

### 5.8 Tasks
```sql
task_priority enum: LOW, MEDIUM, HIGH, URGENT
task_status   enum: TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED
tasks (id, parish_id, service_event_id NULL, department_id NULL, member_id NULL,  -- member_id for follow-up tasks
       kind enum(OPERATIONS, FOLLOW_UP) default 'OPERATIONS',
       title, description NULL, priority, status default 'TODO',
       assigned_by → users, assigned_to → users, due_at timestamptz, completed_at NULL)
  INDEX (assigned_to, status)
```
**Overdue is computed** (`status NOT IN ('DONE','CANCELLED') AND due_at < now()`). Never store it.

### 5.9 Remittance (status only in v1)
```sql
remittance_policies (id, scope_level, scope_id, effective_from date,
                     parish_pct numeric(5,2), area_pct, zone_pct, province_pct, national_pct)  -- must sum to 100
remittances (id, parish_id, period_month date, amount_due_kobo bigint, amount_paid_kobo bigint default 0,
             status enum(OUTSTANDING, PARTIAL, CLEARED), cleared_at NULL, UNIQUE(parish_id, period_month))
```

### 5.10 Messaging & audit
```sql
outbound_messages (id, parish_id, channel enum(SMS, WHATSAPP, EMAIL), to_phone/to_email,
                   template_key, body, status enum(QUEUED, SENT, FAILED) default 'QUEUED',
                   related_member_id NULL, scheduled_for timestamptz, gateway_response jsonb NULL)
audit_log (id, actor_user_id, entity text, entity_id uuid, action text, before jsonb, after jsonb, at timestamptz)
```

## 6. Authorization (non-negotiable)

- Build `lib/auth/scope.ts` exposing `getAccessibleParishIds(user): Promise<string[]>` that walks role assignments down the hierarchy (a ZONAL_PASTOR gets every parish in their zone's areas).
- **Every query that touches parish data goes through a helper that takes the session and filters by `parish_id IN accessibleParishIds`.** No raw table access from route handlers or server actions. Add a unit test per role that proves a user cannot read another zone's data.
- Permission matrix:

| Action | Roles |
|---|---|
| Submit tallies, register first-timers | USHER, HEAD_USHER (assigned parish) |
| Draft/submit service report, enter collections | HEAD_USHER, SECRETARY |
| Verify / reopen report | PARISH_PASTOR (reopen also HEAD_USHER) |
| Add past service, run import | SECRETARY, HEAD_USHER, PARISH_PASTOR |
| Mark imported rows as verified at import time | PARISH_PASTOR only |
| Undo an import | whoever committed it, or PARISH_PASTOR |
| Create/assign tasks in a department | HOD (own dept), PARISH_PASTOR |
| Zone overview | AREA_PASTOR, ZONAL_PASTOR, PROVINCIAL_ADMIN (their scope) |
| Hierarchy/user admin | SYSTEM_ADMIN; PARISH_PASTOR for own parish setup |

- Navigation shows only the tabs a user's roles allow.

## 7. Key workflows

### 7.1 Offline headcount (usher)
1. On opening **Count**, the client caches today's service events, the parish's sanctuary zones and the user's assignment into Dexie.
2. Every tap on a counter writes the full tally row `{client_id, service_event_id, sanctuary_zone_id, men, women, children, first_timers, client_updated_at}` to the Dexie **outbox** (upsert by `(service_event_id, zone_id)` locally).
3. A sync loop (online event + every 15 s + Background Sync where supported) POSTs pending rows to `/api/v1/sync` in batches. Retry with exponential backoff (1s → 60s cap, with jitter).
4. Server upserts on `(service_event_id, sanctuary_zone_id, user_id)`, keeping the row with the newest `client_updated_at`. Re-sending the same `client_id` is a no-op. Respond with per-item status.
5. First-timer registrations go through the same outbox (`kind: 'member.create'`), each carrying its own `client_id`.
6. UI: header pill shows **"All synced"** or **"Offline · N waiting"**. Under the submit button, while offline: "Saved on this device. Sends automatically when you're back online."
7. "Zone so far" on the tally screen = this usher's local count + the latest server sum from other ushers in the same zone (shown as stale while offline).

### 7.2 Service report
- Report page loads tallies summed by zone (expandable "See tallies by zone" table) and pre-fills attendance. Head Usher types collections and notes and submits. The pastor verifies.
- Sign-off tracker: Tallies received (x of y ushers synced) → Draft by Head Usher → Verified by pastor → Sent to Area office.
- Collections inputs accept "145,000" or "145000.50", parse to kobo, and show a live total.

### 7.3 Add past service (manual backlog)
- From Reports → "Add past service". Pick date + service type (+ optional preacher). Attendance fields are typed in (blank = unknown, placeholder "0"). `source = MANUAL`, status DRAFT → SUBMITTED. The pastor verifies like any report.
- **Any past date can be backfilled**, Sunday or midweek. There is no fixed backfill start date. The date picker highlights dates that match the service type's schedule and have **no VERIFIED report**, and allows any other past date too (SPECIAL types take any date). Future dates are not allowed.
- If a `service_event` already exists for (parish, type, date, occurrence), open that report instead of creating a duplicate. If it is already VERIFIED, show it read-only with the normal reopen rules. If the type allows more than one per day and all existing occurrences are taken, offer "Add another {service} on this date" up to `max_per_day`.

### 7.4 Spreadsheet import (4 steps, `/reports/import`)
1. **Upload**: .xlsx/.xls/.csv up to 10 MB. Server parses with SheetJS, lists sheets, and the user picks one. Store the batch + raw rows (`import_rows.raw`). Offer a "Download a blank template" CSV with the canonical headers.
2. **Match columns**: auto-map headers using a synonym table (e.g. `Male|Men|M → men`, `Female|Women|W → women`, `Kids|Children|Child → children`, `New comers|Newcomers|First timers|FT → first_timers`, `Offering|Off → offering`, `Tithe|Tithes → tithe`, `Seed|Thanksgiving|Special → special_seed`, `Remarks|Notes → notes`, `Date → event_date`, `Service|Service type → service_type`). Flag low-confidence matches with "Check this". The user confirms the date format (DD/MM/YYYY default; Excel serial dates handled automatically). Each column can be "Don't import".
3. **Review** (dry run, nothing written to reports yet). Validate every row and show counts: **Ready**, **Need a fix**, **Already in app · skipped**. Issue types, each with a per-row resolution dropdown:
   - Date doesn't match the service type's weekday → pick the nearest service or skip
   - Non-numeric value ("N/A", "-", "nil") → import as 0, or as blank (unknown), or skip
   - Blank count → leave blank (unknown), the default, or import as 0
   - Unknown service name → map to an existing service type or skip
   - Total column present and ≠ men+women+children → keep components or skip
   - Duplicate of an existing service_event (same type, date and occurrence) → always skipped (never overwrite)
   - Several rows with the same service type + date: if the type's `max_per_day` allows it, assign occurrences by a mapped `Time` column, else by row order, and show the assignment for confirmation; if there are more rows than `max_per_day`, flag "Need a fix" (skip extras or raise the limit in admin)
   Choose after-import status: "Imported · needs pastor check", the default, or "Verified now" (PARISH_PASTOR only).
4. **Commit** in one DB transaction: create missing `service_events`, insert `service_reports` with `source = IMPORT` and `import_batch_id`. Show "N services imported · {first date} – {last date}".
   **Undo this import**: delete reports (and service_events created by) that batch, provided none of them was edited after import. If some were edited, list them and require confirmation. Mark the batch UNDONE. Writes to audit_log.

Unit-test the parser and validator with fixture spreadsheets in `tests/fixtures/imports/` (messy headers, merged title rows above the header, Excel serial dates, "N/A" cells, duplicate rows).

### 7.5 First-timer follow-up (jobs)
On first-timer registration (with `consent_contact = true`):
- Day 0: queue a welcome message in `outbound_messages` (stub sender)
- Day 3: create a FOLLOW_UP task for the parish follow-up lead: "Call {name}, capture prayer points"
- Day 7: queue a Tribe invite (nearest small group)
- Day 14: queue a Believers' Class invite
- Day 30: if the member has ≥3 check-ins in `attendance_checkins` within the 30 days, set status FIRST_TIMER → REGULAR_MEMBER. Otherwise flag the member for pastoral follow-up.
Run as a daily pg-boss cron at 06:00 Africa/Lagos. Jobs must be idempotent.

### 7.6 Zone overview queries
For the user's scope and a period (this week / month / quarter):
- Sunday attendance (sum of verified totals) + % change vs previous period
- First-timer 30-day retention for the cohort that started 30–60 days ago (target 60%)
- Remittance cleared: parishes CLEARED / total for the period
- Workers on duty (sum) + absent (rostered usher assignments without check-in)
- 8-week Sunday attendance trend (bar chart, latest bar emphasised)
- "Needs attention": parishes with no report for the last service, reports submitted but unverified > 24 h, open Day-3 follow-up tasks
- Parish compliance table: Parish, Area, Attendance, Report (Submitted / Late / Overdue), Finances (Verified / Awaiting pastor / Not logged), Remittance (Cleared / Outstanding), Overall (On track / Watch / Follow up)

## 8. UI specification

The canvas design is the reference. Reproduce its structure; refine the visuals with shadcn, but keep the tokens.

### 8.1 Tokens (put in `tailwind.config.ts` + CSS variables)
| Token | Hex | Use |
|---|---|---|
| `brand` | `#180C62` | header bar, primary buttons, active nav, headings |
| `brand-soft` | `#F1EFFA` | selected card bg, total rows, active nav bg |
| `brand-tint` | `#E6E3F5` | badges ("On your roster"), active tab pill |
| `danger` | `#D61812` | urgent/overdue borders and dots (text on light bg: `#A3120D`) |
| `success` | `#028A2C` | done/verified dots (text: `#0F5E24`, bg `#E7F5EC`) |
| `warning` | `#C98A12` | watch/awaiting dots (text `#7A4A00`, bg `#FDF2DC`) |
| `canvas` | `#F8F9FA` | page background |
| `surface` | `#FFFFFF` | cards, inputs |
| `ink` | `#1E293B` | body text |
| `muted` | `#64748B` | secondary text |
| `line` | `#E2E8F0` | borders |

Fonts: **Inter** (UI), **JetBrains Mono** (all counts, money, codes). 8-pt spacing. Radius 10–16 px. Status is never shown by colour alone: always a dot or pill **plus a word**.

### 8.2 App shell
- **≥768 px**: brand-blue top bar (logo placeholder, parish name, "Area · Zone · Region" line, sync pill, account avatar) + 232 px left sidebar with nav. Content max-width ~1180 px.
- **<768 px**: brand-blue app bar (screen title + parish name + sync pill) and a **fixed bottom tab bar**: Count · Tasks · Reports · Zone (+ Members when built). Active tab = brand text + tinted pill behind the icon. Content scrolls between the bars. Respect `env(safe-area-inset-bottom)`.
- Tabs are filtered by role.
- PWA manifest: name "Parish CRM", theme `#180C62`, standalone display, icons from a placeholder logo.

### 8.3 Screens
1. **Count › Choose service & zone**: greeting + date; service radio cards (name, time, location); 2-column grid of sanctuary-zone cards (name, capacity, "On your roster" badge); note "Also counting this zone: {other ushers}. Your counts add together."; primary button "Start tally · {zone}". On desktop the column is centered at max 560 px.
2. **Count › Tally**: back button + zone/service title; big "Your count" (mono 52 px) and "Zone so far"; rows for Men / Women / Children with **−, +1, +5** (48 px tall buttons, +1 is solid brand); First-timers row with − / +1 and the hint "already counted above"; "Register first-timer details · N to go" button; "Review & submit headcount".
3. **Count › First-timer**: segmented control "Scan guest card | Type details" (scan disabled in v1); full name*, phone* with +234 prefix (mono), "Same number on WhatsApp" checkbox, gender radios, nearest Tribe select, consent checkbox; "Save & add another" / "Save & finish".
4. **Tasks**: title + "{service} · N overdue"; department filter; "New task". Desktop: 4-column board (To do / In progress / For review / Done) with drag-and-drop (dnd-kit). Phone: horizontal status chips ("To do · 3") showing one column's cards, with status changed from the card menu. Cards: priority pill (Urgent = solid red), department pill, title, assignee, due. Overdue cards get a red border and red bold due text.
5. **Reports list**: "Import spreadsheet" (outline) + "Add past service" (solid); dashed **backlog banner**: "N past services have no record" with "Import now". Rows: date, service, attendance (mono), collections (mono), status pill: Draft (amber) / Verified (green) / No record · add (red) / Imported · check (brand tint). "No record" rows are generated from active service_types × their scheduled dates **within the date range the user picks** (filter at the top of the list; default the last 12 weeks; any past range allowed). A date counts as a gap when it has no VERIFIED report; dates with a draft or unverified report show that report's pill instead. Clicking "No record · add" opens Add past service prefilled with that date and type. Rows wrap to stacked cards on phone.
6. **Service report** (live or past): back + title "{service} · {date}" + status pill; **Service** card (date, service type, preacher), with a note on past records: "Past records don't need usher tallies. The pastor still signs off before they count in zone totals."; **Attendance** card (5 numeric inputs + total row; caption "Prefilled from N usher tallies" or "Type the numbers from your records"); **Collections** card (₦-prefixed mono inputs, live total, notes); **Sign-off** aside (tracker, verifying pastor, "Submit for verification", "Save draft"); remittance preview aside with split shown from policy.
7. **Import wizard**: 4-segment progress bar (Upload · Match columns · Review · Done) and the screens described in §7.4.
8. **Zone overview**: KPI tiles (auto-fit grid, 2-up on phone), 8-week bar chart, "Needs attention" list, compliance table on desktop / parish cards on phone (name, area · attendance, overall pill, three mini status cells).
9. **Members** (simple v1): searchable list, profile with status + milestones checklist, follow-up history.
10. **Admin**: CRUD for hierarchy, parishes, sanctuary zones, service types, departments, users & role assignments.

### 8.4 Accessibility & quality bar
- Real `<button>`, `<a>`, `<label for>`; `aria-label` on icon-only buttons; `aria-pressed`/`aria-current` on selection controls.
- Touch targets ≥ 44 px; inputs ≥ 16 px font on mobile (no iOS zoom).
- WCAG AA contrast (use the darker text shades listed in §8.1 for coloured text).
- `inputmode="numeric"`/`"decimal"`/`"tel"` on the right fields.
- Every page works at 360 px wide with no horizontal page scroll (wide tables scroll inside their own box).
- Lighthouse PWA installable; LCP < 2.5 s on a throttled "Fast 3G" profile for the Count screen.

## 9. Seed data

`pnpm db:seed` creates: 1 region, 1 province, 1 zone ("Lagos Zone 4"), 3 areas, 6 parishes; for the first parish: 4 sanctuary zones (Main Floor – Center 320, Gallery – Left 140, Gallery – Right 140, Children's Church 90), service types (Sunday 1st Service 08:00, Sunday 2nd Service 10:30, Accelerate Tue 18:30), 6 departments, 2 tribes, 40 members, 8 weeks of verified reports, one draft, one missing Sunday and one missing midweek service (older than 8 weeks too, to test backfilling far back), Sunday 2nd Service with `max_per_day = 2`; users for each role with password `password123` (dev only). Also put a sample messy spreadsheet in `tests/fixtures/imports/` for manual testing of the importer.

## 10. Build order & acceptance criteria

Work milestone by milestone. At the end of each: run `pnpm lint && pnpm typecheck && pnpm test`, update `docs/DECISIONS.md`, and commit with a clear message.

**M0: Skeleton.** Next.js + Tailwind + shadcn + Drizzle + Docker Postgres + Auth.js. Responsive shell with role-filtered nav, tokens, fonts.
✔ Login works; desktop shows sidebar, 390 px viewport shows bottom tabs (Playwright screenshot test for both).

**M1: Schema, scope and admin.** Full schema + migrations + seed. `getAccessibleParishIds` + scoped query helpers. Admin CRUD.
✔ Unit tests prove an AREA_PASTOR of Area 1 cannot read Area 2 parishes; a PARISH_PASTOR can't read another parish.

**M2: Headcount (online first).** Service/zone selection, tally, first-timer registration, report pre-fill from tallies.
✔ Two ushers tallying the same zone sum correctly in the report.

**M3: Offline.** Serwist + Dexie outbox + `/api/v1/sync` idempotency + sync pill.
✔ Playwright: go offline, tally 20 taps, register a first-timer, reload the page (data survives), go online, and the server totals match exactly; re-sending the batch creates no duplicates.

**M4: Service reports & verification.** Collections, submit, verify, lock, reopen with audit log.
✔ Verified report fields are read-only; reopen requires role; audit rows written.

**M5: Backlog.** Reports list with "No record" gaps, manual past service, import wizard with undo.
✔ Fixture import: all issue types detected; duplicates skipped; blanks stored as NULL; commit is atomic; undo removes exactly that batch.

**M6: Tasks.** Board (desktop DnD, phone chips), create/assign, computed overdue.
✔ Overdue cards render correctly; HOD can only assign within own department.

**M7: Zone overview.** All KPIs, chart, attention list, compliance table/cards; only VERIFIED reports counted.
✔ Numbers match a hand-computed SQL check against seed data (write that test).

**M8: Members & follow-up jobs.** Member list/profile/milestones; pg-boss daily job for the Day 0/3/7/14/30 pipeline (stub sender).
✔ Fast-forward test: a first-timer with 3 check-ins in 30 days becomes REGULAR_MEMBER; a Day-3 task is created exactly once.

**M9: Hardening.** Error boundaries, empty states, loading skeletons, rate limiting on auth + sync, CSP headers, backups doc, deploy guide (`docs/DEPLOY.md`: any Node host + managed Postgres, e.g. a VPS with Docker Compose).

## 11. Conventions

- Server-only code in `lib/**` imports `server-only`. Never expose DB clients to the client.
- All mutations validate with Zod, check permission, run in a transaction where they touch >1 table, and write `audit_log` for reports, imports, remittances and role changes.
- No `any`. No floats for money. No storing derived state (overdue, totals).
- UI copy is plain and short; Nigerian English conventions; dates like "Sun 18 Oct 2026"; currency "₦1,240,500".
- Don't put brand names of the builder or any company in code comments, package names or UI.
- Prefer small, composable components: `TallyCounter`, `StatusPill`, `KpiTile`, `MoneyInput`, `CountInput`, `SyncPill`, `BottomTabs`, `SideNav`, `ImportStepper`.

## 12. Commands (create these scripts)

```
pnpm dev            # next dev
pnpm db:up          # docker compose up -d postgres
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # drizzle-kit migrate
pnpm db:seed        # tsx scripts/seed.ts
pnpm jobs           # start pg-boss workers
pnpm lint | typecheck | test | test:e2e
```

## 13. Open questions (ask the user; don't guess silently)

1. Remittance split percentages per level, and whether policy differs by province.
2. ~~Earliest date to backfill from~~ **Decided:** no fixed start date; any past date can be backfilled and gaps show for a user-picked range (§7.3, §8.3).
3. Which SMS/WhatsApp provider to use when messaging goes live.
4. ~~Multiple services of the same type on one day~~ **Decided:** configurable per parish per service type via `max_per_day`; `occurrence` is part of the unique key (§5.5).
5. Hosting target and domain.
