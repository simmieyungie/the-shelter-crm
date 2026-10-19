# Deploying Parish CRM

Parish CRM is one Node.js app plus a background job worker, both talking to PostgreSQL 16. Any Node host with managed Postgres works. The simplest setup, described here, is a small Linux VPS running Docker Compose.

## What you need

- A VPS with 2 GB RAM or more (Ubuntu 24.04 is fine) and Docker installed.
- A domain name, for example `crm.example.org`, with an A record pointing at the VPS.
- Ports 80 and 443 open.

## First deploy

```sh
git clone git@github.com:simmieyungie/the-shelter-crm.git
cd the-shelter-crm
cat > .env <<'ENV'
DOMAIN=crm.example.org
POSTGRES_PASSWORD=change-me-to-a-long-random-string
ENV
docker compose -f docker-compose.prod.yml up -d --build
```

The `web` service applies database migrations on every start, then serves the app. Caddy gets an HTTPS certificate automatically.

Create the first system administrator:

```sh
docker compose -f docker-compose.prod.yml exec web \
  pnpm exec tsx --conditions=react-server scripts/create-admin.ts "Full Name" admin@example.org 08031234567 'a-long-password'
```

Sign in at `https://crm.example.org`, then use **Admin** to build the hierarchy, set up parishes and add people. **Never run `pnpm db:seed` in production**: it creates demo users with a shared password.

## Updating

```sh
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically when `web` restarts.

## Background jobs

The `jobs` service runs pg-boss. It runs the first-timer follow-up pipeline every day at 06:00 Lagos time. If the server was down at 06:00, it runs once when it comes back. It also runs the message sender every minute. In v1 the sender only logs messages, because no SMS/WhatsApp provider is connected yet. Logs:

```sh
docker compose -f docker-compose.prod.yml logs -f jobs
```

## Backups

The `backup` service writes a compressed `pg_dump` to `./backups` every night at 02:00 Lagos time. It keeps 14 daily and 8 weekly copies. **Copy `./backups` off the server** as well, for example to object storage with a nightly `rclone` cron. A backup that only lives on the same machine is not a backup.

Restore into a fresh database, for a drill or a real recovery:

```sh
docker compose -f docker-compose.prod.yml stop web jobs
docker compose -f docker-compose.prod.yml exec -T postgres dropdb -U crm crm
docker compose -f docker-compose.prod.yml exec -T postgres createdb -U crm crm
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U crm -d crm < backups/crm-YYYY-MM-DD.dump
docker compose -f docker-compose.prod.yml start web jobs
```

Do a restore drill at least once a quarter.

## Configuration

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | web, jobs | Postgres connection string |
| `APP_URL` | web | Public URL, used in sign-in links |
| `DOMAIN` | caddy | Domain for HTTPS |
| `POSTGRES_PASSWORD` | postgres | Database password |

## Security notes

- Sessions are http-only, secure cookies stored hashed in the database. Signing out deletes the session.
- Sign-in, magic-link requests, imports and the sync endpoint are rate-limited per IP or user. The limiter is in memory, so it assumes a single web container. Move it to Postgres or Redis before running several web containers.
- Security headers, including a Content Security Policy, are set in `next.config.ts`.
- Email sign-in links are written to the web log until an email provider is configured in `lib/mail.ts`.
