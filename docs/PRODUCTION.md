# Production architecture

The bundled runtime intentionally remains dependency-free and uses an atomic JSON repository, which makes the archive start immediately after unpacking. The API boundary is stable and maps directly to the normalized PostgreSQL schema in `db/schema.sql`.

## Recommended deployment

- Node.js service behind Caddy/Nginx with TLS.
- PostgreSQL 16 using `db/schema.sql`; S3-compatible object storage for media.
- Repository adapter built with Drizzle ORM or Prisma; keep HTTP handlers unchanged.
- Redis for distributed rate limits and session revocation when more than one app instance is used.
- Daily database backups plus object-storage lifecycle rules.

## Implemented security baseline

HMAC HttpOnly sessions, SameSite=Strict, CSRF header verification, PBKDF2 password hashes, role authorization, request-size bounds, login throttling, file allowlist/size bounds, CSP, frame protection, referrer and permissions policy, append-only audit events and version snapshots.

## Release gates

Run `npm test`, syntax checks, keyboard-only smoke testing, 390 px and desktop visual inspection, contrast review, reverse-proxy header tests, restore-from-backup drill, load test, dependency audit for the selected PostgreSQL adapter, and an OWASP ZAP passive scan.
