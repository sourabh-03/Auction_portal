# Database handoff

`procease_auction_data.sql` is a **data-only** dump of the exact database
this project was built and tested against — every auction, bid, vendor,
and notification created during development. It is *not* a schema dump —
the schema comes from Prisma's migrations (already in `backend/prisma/migrations/`),
which the recipient runs themselves so the database structure matches
exactly what the app's code (Prisma Client) expects.

This file is **not committed to git** (see `.gitignore`) — it's test data,
not source code, and shouldn't live in a public repository. Hand it to the
recipient directly (email, a shared drive, USB, etc.) alongside the repo.

## Restore steps (for whoever is receiving this)

1. Install PostgreSQL, then create a database and a role for the app —
   see the main `README.md`'s Setup section for the exact `CREATE ROLE` /
   `CREATE DATABASE` commands, or your own preferred setup.
2. Point `backend/.env` at that database (copy from `backend/.env.example`).
3. From `backend/`, create the schema (tables, enums, indexes) with Prisma —
   **do this before restoring data**:
   ```bash
   cd backend
   npm install
   npx prisma migrate deploy
   ```
4. Restore the data into those now-empty tables:
   ```bash
   psql "$DATABASE_URL" -f ../db-backup/procease_auction_data.sql
   ```
   (Use the same connection string as `DATABASE_URL` in `backend/.env`, or
   pass `-U <role> -h <host> -d <database>` directly instead of a URL.)
5. Re-apply the append-only lockdown on the bid log — a fresh `migrate deploy`
   doesn't carry over the custom `REVOKE` from the original database:
   ```bash
   psql "$DATABASE_URL" -v app_role=<your_db_role> -f prisma/sql/revoke_bid_log_mutations.sql
   ```
6. Start the backend and frontend per the main README. Every auction,
   vendor, and bid from the original session will be there exactly as it
   was — including all vendor passwords (only the bcrypt hash carries
   over, so log in with whatever plaintext password the vendor was
   originally given).

## A note on compatibility

This dump was produced with PostgreSQL 18's `pg_dump`, which adds
`\restrict` / `\unrestrict` lines at the top and bottom of the file (a
newer `psql` meta-command). If the recipient's `psql` is older than
version 18 and errors on those two lines specifically, just delete both
lines from the file and re-run the restore — everything else in the file
is plain, version-independent `INSERT` statements.
