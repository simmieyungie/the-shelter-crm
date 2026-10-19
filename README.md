# Parish CRM

A web app for RCCG parishes, areas and zones. Ushers count attendance on their phones, even offline. Service reports go from usher tallies to Head Usher draft to pastor verification. Parishes can import their old Excel records. Department heads run a task board. Area and Zonal Pastors get a zone overview. The full product spec is in [agent.md](agent.md).

## Run it locally

You need Node.js 22+ (24 LTS recommended), pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env.local
pnpm db:up          # Postgres 16 on localhost:5433
pnpm db:migrate
pnpm db:seed        # demo zone, 6 parishes, users for every role
pnpm dev            # http://localhost:3000
pnpm jobs           # optional: follow-up jobs and the stub message sender
```

To start from a clean database: `pnpm db:reset`.

### Demo logins

Every demo account uses the password `password123`. This is for development only.

| Role | Email |
|---|---|
| Usher | usher1@example.com, usher2@example.com |
| Head Usher | headusher@example.com |
| Secretary | secretary@example.com |
| Head of Department (Technical) | hod@example.com |
| Tribe Leader | tribe@example.com |
| Parish Pastor (Shelter Parish) | pastor@example.com |
| Parish Pastor (Grace Assembly) | pastor2@example.com |
| Area Pastor (Ikeja / Ogba) | areapastor@example.com, areapastor2@example.com |
| Zonal Pastor | zonalpastor@example.com |
| Provincial Admin | provadmin@example.com |
| System Admin | admin@example.com |

The service worker, which provides offline support, only runs in a production build: `pnpm build && pnpm start`.

## Tests

```sh
pnpm lint && pnpm typecheck && pnpm test   # unit + integration (uses database crm_test)
pnpm test:e2e                              # Playwright, desktop and 390×844 phone (uses crm_e2e)
```

A sample messy spreadsheet for trying the importer by hand is in `tests/fixtures/imports/messy-register.xlsx`.

## Docs

- [docs/QUESTIONS.md](docs/QUESTIONS.md): church-logic questions and the decision taken for each.
- [docs/DECISIONS.md](docs/DECISIONS.md): technical decisions.
- [docs/DEPLOY.md](docs/DEPLOY.md): deploying to a VPS, backups and restore.
