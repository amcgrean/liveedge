# Codex handoff — Sales Job Notes (mobile Phase 4)

**Self-contained ticket.** No dependency on the Agility wiring (Phases 2/3).
Builds on the Phase 1 auth + client plumbing already in `main`.

## Goal

Let a sales rep capture notes on a **job** from the field — walking a house for
trim specs, a showroom spec meeting, a jobsite measure. Notes are LiveEdge-owned
(`bids` schema), text + photos + a note type, attachable to a customer and
optionally an SO. **A note must be creatable before any SO exists** (prospect /
pre-quote), so it is NOT SO-keyed — it's keyed on customer/address with an
optional SO link.

Design forward-compat: include a `fields jsonb` column now. It's empty in v1 but
is the seam for Phase 5 "quick-quote templates" (a template = a named field
schema; filling it writes structured `fields`). **Do not skip this column.**

## Schema — `db/migrations/00NN_sales_job_notes.sql`

Pick the next free migration number. Apply manually in the Supabase SQL editor
(note that in the migration header, per repo convention).

```sql
CREATE TABLE bids.sales_job_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id  text NOT NULL,            -- app_users id (string)
  author_name     text,
  branch_code     text,
  customer_code   text,                     -- nullable: prospect may have none
  customer_name   text,
  so_id           text,                     -- nullable: link if/when an SO exists
  address_label   text,                     -- free text, e.g. "Lot 14 Hickory Ln"
  note_type       text NOT NULL DEFAULT 'general'
                  CHECK (note_type IN ('site_visit','spec_meeting','measure','general')),
  body            text NOT NULL DEFAULT '',
  fields          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- template seam (Phase 5)
  photo_keys      text[] NOT NULL DEFAULT '{}',        -- R2 object keys
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_sales_job_notes_customer ON bids.sales_job_notes (customer_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_job_notes_so       ON bids.sales_job_notes (so_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_job_notes_author   ON bids.sales_job_notes (author_user_id, created_at DESC) WHERE deleted_at IS NULL;
```

Add the Drizzle definition to `db/schema.ts` (`bids` schema, `bidsSchema.table`).
**Schema-hygiene:** no FKs into the Agility mirror; this is LiveEdge-native data.

## Web API — `app/api/sales/mobile/job-notes/`

All routes guard with `requireSessionOrMobile(req, 'sales.view')` (from
`src/lib/mobile-auth.ts`) — this is a recognized `guardPattern`, so
`check-route-guards` passes with no policy edit. Use Drizzle (`getDb`) for the
`bids` tables. Branch scoping: stamp `branch_code` from `session.user.branch`
on create; non-`branch.all` users only see/edit their branch's notes.

- `GET  /api/sales/mobile/job-notes?customer=&so=&mine=1&limit=` — list (filter
  by customer_code and/or so_id; `mine=1` → author = session user). Newest first.
- `POST /api/sales/mobile/job-notes` — create. Body:
  `{ customer_code?, customer_name?, so_id?, address_label?, note_type, body, fields?, photo_keys? }`.
  Stamp author/branch from the session. Returns the created row.
- `GET  /api/sales/mobile/job-notes/[id]` — single note.
- `PATCH /api/sales/mobile/job-notes/[id]` — partial update (body/fields/type/
  photo_keys/links). Author or `branch.all` only.
- `DELETE /api/sales/mobile/job-notes/[id]` — soft delete (`deleted_at = now()`).
- `POST /api/sales/mobile/job-notes/photo-upload-url` — presigned R2 PUT URL
  (mirror the driver POD pattern: `POST /api/dispatch/orders/[so]/pod/upload-url`
  and `src/lib/r2.ts`). Key prefix: `job-notes/{noteId-or-uuid}/{ts}-{name}`.

Two-phase photo flow (same as driver POD): client gets a presigned PUT, uploads
the bytes directly to R2, then includes the returned `photo_keys` in the
create/patch body. Add a `GET …/[id]/photos` (or return presigned GET URLs on
the note) so the mobile app can display them.

## Mobile — `mobile-app/`

Follow the existing Sales conventions: component kit in
`src/components/sales/kit.tsx`, tokens `C`/`S` in `src/theme/colors.ts`, the
mock-then-real seam pattern in `src/data/salesMock.ts` + `src/api/sales.ts`
(add a `src/api/jobNotes.ts` and `src/data/jobNotesMock.ts` mirroring it; gate
on `IS_DEV_MODE`). Writes go through the **offline outbox**
(`src/storage/outbox.ts`) so a note taken with no signal syncs later —
including photo uploads (resumable, like the POD flow).

Screens (reuse `SalesTopBar`, `ListRow`, `EmptyState`, `BigButton`, `SegTabs`,
status/`StatusPill` patterns):
- **Job Notes list** — filterable (mine / by customer / by SO). New `notes` tab
  OR surfaced from Home + customer/order detail (see below). Empty state.
- **Add / Edit note** — note-type segmented control (site visit / spec meeting /
  measure / general), multiline body, photo capture (reuse `expo-camera` +
  `photoFS` from the driver app), customer + optional SO attach, address label.
  Draft-save + offline-queued states (mirror `submitted.tsx`).
- **Note detail** — body, photos (tap to view), type, links, author/date.
- **Surface on existing detail screens**: a "Notes" section on
  `customer/[code].tsx` (Notes tab — currently a coming-soon placeholder) and on
  `order/[so].tsx`, each linking to the note list filtered to that customer/SO,
  with a "+ Add note" affordance.

## Acceptance criteria

- [ ] Migration applies; Drizzle type compiles (`npx tsc` clean in root + mobile).
- [ ] `check-route-guards` passes (routes use `requireSessionOrMobile`).
- [ ] Create a note with no `so_id` (prospect) and with photos; it lists under
      the customer and (if linked) the SO.
- [ ] Offline create queues to the outbox and syncs on reconnect; photos upload
      resumably (retry doesn't double-upload).
- [ ] Customer detail "Notes" tab shows real notes (replacing the placeholder).
- [ ] `fields jsonb` round-trips (store + read arbitrary JSON) even though no UI
      writes it yet — proves the Phase 5 template seam.

## Reference files

- Auth guard: `src/lib/mobile-auth.ts` (`requireSessionOrMobile`)
- R2 / presigned uploads: `src/lib/r2.ts`, driver POD upload route
- Mobile seam pattern: `mobile-app/src/api/sales.ts`, `src/data/salesMock.ts`
- Offline outbox + photo FS: `mobile-app/src/storage/outbox.ts`, `src/storage/photoFS.ts`, `src/storage/sync.ts`
- Sales component kit: `mobile-app/src/components/sales/kit.tsx`
- Plan context: `docs/agent-prompts/sales-mobile-phased-plan.md`
