# ProcEaze Auction Module (v1)

English Reverse and Japanese Descending Clock reverse-auction system for
industrial procurement. Built from `AUCTION-MODULE-TECH-SPEC.md`.

- `backend/` — NestJS + Prisma + PostgreSQL + Socket.IO API
- `frontend/` — React + TypeScript + Vite

## Setup

### 1. Database

Point `backend/.env` (copy from `backend/.env.example`) at a Postgres
instance. Then:

```bash
cd backend
npm install
npx prisma migrate deploy   # or `prisma migrate dev` for local dev
npm run seed                # sample vendors + threads, password123 for everyone
```

Apply the append-only lockdown on the bid log — **do this once per
database, and again after any migration that recreates the table** (Prisma
doesn't preserve custom grants across a table rebuild):

```bash
psql "$DATABASE_URL" -v app_role=<your_db_role> -f prisma/sql/revoke_bid_log_mutations.sql
```

### 2. Backend

```bash
cd backend
npm run start:dev   # :4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_BASE, defaults to http://localhost:4000
npm install
npm run dev          # :5173
```

### Test accounts (after seeding)

All passwords are `password123`.

| Role | Email |
|---|---|
| Auction Team | `ritu.menon@procease.local` |
| Vendor (NDA accepted) | `vendor1@bharatbearings.example` |
| Vendor (NDA accepted) | `vendor2@precisionrotodyne.example` |
| Vendor (NDA **not** accepted — exercises the acceptance gate) | `vendor3@anandengg.example` |
| Vendor (NDA accepted) | `vendor4@konkanindustrial.example` |

## What's been validated

- Backend: `npm test` (21 unit tests covering ranking/ties/zero-bids/
  single-bidder/floor-price/min-vendor-on-first-tick), full `tsc`
  type-check, `nest build`.
- End-to-end against a real local Postgres instance: full English lifecycle
  (draft → configure → go-live → decrement-validated bidding → auto-close
  → ranking → send-result), full Japanese lifecycle (go-live → stay/drop →
  auto-drop-on-timeout → early mid-window finalize on min-vendor threshold
  → ranking), append-only `BidLogEntry` enforced at the DB grant level
  (`UPDATE`/`DELETE` confirmed rejected), NDA gate, reserve-price hiding,
  and competitor anonymization (§6.1's fix) all confirmed via direct API
  calls.
- Frontend: real Chrome browser run (Playwright) through every screen —
  both logins, Auction Desk, new-referral flow, full Configure form,
  Live Console (internal), Result Review, Vendor Home, and the vendor
  closed-outcome view — zero console errors, screenshots visually checked
  against the ProcEaze design language.

Three real bugs were found and fixed during that browser pass (not
caught by the curl-based API tests, which happened to always check state
after go-live rather than during configuration):
1. A login race where the API client's auth token wasn't set synchronously,
   so the first authenticated request after login could fire with no
   `Authorization` header.
2. `AuctionViewService.getTeamSnapshot` sourced the invitee list from
   `AuctionSeat` rows, which don't exist until go-live — the Configure
   screen's vendor checklist silently went empty right after creating a
   draft.
3. The Configure screen's save action echoed the full state snapshot
   (including read-only fields like `currentEndsAt`) back through the
   config PATCH, which the backend's `forbidNonWhitelisted` validation
   correctly rejected.

## Deliberate deviations / flagged assumptions

Everything below was a genuine gap or an unavoidable technical necessity —
each is called out inline in the code with a comment at the point of the
decision. Flagging them here too so they're easy to review as a batch:

- **Seat-release timeout**: spec §17 explicitly flags this as unspecified
  and says to "pick a number... before this ships." Defaulted to 60s
  (`SEAT_RELEASE_TIMEOUT_SEC`), the spec's own suggested value.
- **`Vendor.phone`**: added to the schema. SMS notifications to vendors are
  explicitly in-scope (§2, §13), but the spec's §9 schema has no contact
  number for `Vendor` at all — that's an inconsistency in the spec itself,
  not a deferred item.
- **`AuctionSeat.disconnectedAt`**: added to the schema, needed to
  implement the seat-release timeout above.
- **English minimum invited-vendor count**: the tech spec's text doesn't
  state a minimum (only the prototype's UI enforces ≥2, and the build
  prompt says to follow the spec over the prototype where they disagree).
  The backend only enforces the bare logical minimum of 1.
- **Japanese same-tick mass-drop ties**: the spec names a `tieBreakRule`
  for English only. When several vendors auto-drop in the same tick
  (a likely occurrence with auto-drop on), they're tied at the same rank
  and flagged for manual review — extending the same pattern the spec
  already uses for English manual ties and Japanese active-at-close ties,
  rather than inventing a new rule.
- **Endpoints not in spec §10's table**: `GET /api/vendors` (vendor
  directory, for picking invitees), `GET/PATCH /api/notifications*`
  (portal bell-icon read/list). Necessary plumbing for explicitly in-scope
  features the endpoint table didn't enumerate.
- **Real SMS/email provider adapters** (Resend, MSG91): implemented
  against each provider's published API shape but not exercised against
  live credentials — verify before relying on them in production. The
  default `EMAIL_PROVIDER=console` / `SMS_PROVIDER=console` just logs.
- **`bcrypt` → `bcryptjs`**: swapped for the pure-JS implementation: this
  environment has no network access to build `bcrypt`'s native module
  (node-gyp couldn't fetch Node headers). Functionally identical API.

## Known gaps (explicitly deferred per spec §17 — not built)

Vendor suspension mid-auction, live per-vendor connection status, a grace
reconnect window, signed/tamper-evident export, vendor MFA, maker-checker
on send-result, split-award automation, multi-currency, TC-side
notification on result sent. All absent, not half-built, per the spec.
