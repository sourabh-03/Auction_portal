-- Enforces BidLogEntry as genuinely append-only at the database grant level.
-- Run this once against the target database, as a role with GRANT privileges,
-- AFTER `prisma migrate deploy` has created the table, and again after any
-- migration that recreates the table (Prisma does not preserve custom grants).
--
-- Replace app_role with the actual role your DATABASE_URL connects as.
--
-- Usage:
--   psql "$DATABASE_URL" -v app_role=procease_app -f prisma/sql/revoke_bid_log_mutations.sql

REVOKE UPDATE, DELETE ON "BidLogEntry" FROM :app_role;

-- Sanity check: confirm only INSERT/SELECT remain for the app role.
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name = 'BidLogEntry' AND grantee = :'app_role';
