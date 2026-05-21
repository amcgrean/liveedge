# Hubbell Daily Check Ingest — Addendum (2026-05-20)

Resolutions to the LiveEdge agent's 8-point review of
`hubbell-daily-check-ingest-2026-05-20.md`. Apply this before migration
0026.

---

## 1. Redundancy with `hubbell_document_payments` — **option (a): replace**

`hubbell_check_lines` becomes the canonical source of payment facts.
`hubbell_document_payments` gets retired in the same migration.

Reasoning:
- `check_lines` has the richer structure already (`memo`, `gross_amount`,
  `invoice_date`, `line_seq`). Backfilling those from the existing payments
  table is a one-time write.
- Two tables driving the same rollup columns is exactly the drift problem
  we want to avoid going forward.
- The 4,879-row migration is trivial — synthesize one `check_lines` row
  per existing `hubbell_document_payments` row, new columns nullable for
  backfill (or filled in from a one-time portal re-scrape for full
  fidelity).

Implementation order in migration 0026:
1. Create `hubbell_checks` + `hubbell_check_lines` (empty)
2. Backfill `hubbell_checks` by `SELECT DISTINCT check_number, …` from
   `hubbell_document_payments`
3. Backfill `hubbell_check_lines` 1:1 from `hubbell_document_payments`
   (memo / gross_amount / invoice_date NULL for now)
4. Rewrite the `hubbell_documents` rollup trigger (or matview) to read
   from `hubbell_check_lines`
5. Drop `hubbell_document_payments` in the SAME migration so there's no
   window where both exist
6. Validate `paid_amount_total` / `last_payment_date` / `payment_status`
   on `hubbell_documents` unchanged before/after (spot-check 20 rows)

Optional follow-up (not blocking 0026): re-scrape the last 6 months of
check detail pages to backfill `memo` / `gross_amount` / `invoice_date`
on historical `check_lines` rows. The PC's
`export_portal_invoice_table_v8_full.py` already does this; the Pi script
can be invoked once with `--backfill_months 6`.

---

## 2. `(payer_entity, check_number)` UNIQUE — **agreed, with derivation rule**

Add `payer_entity` column on `hubbell_checks`. Constraint becomes
`UNIQUE (payer_entity, check_number)`.

**Derivation:** the scraper currently doesn't track this (Payment History
at `pgm=marwbvo` is segregated by `vendornumber=000658`, which is Beisser
— the payee — not the payer entity). Two options:

**Option A (preferred — infer from line content):** for each check, look
at the doc_numbers on its lines and join back to `hubbell_documents`. The
dominant `dev_code` → entity mapping gets the check's `payer_entity`.
Most Hubbell checks pay one entity's POs at a time, so the
dominant-entity heuristic is unambiguous in ~99% of cases. For mixed
checks, pick the entity holding the largest dollar share.

The `dev_code → entity` mapping is small and stable:
- `AP/BE/BN/CR/DC/etc.` (most subdivisions) → `HUBB1200` (Hubbell Homes LC)
- Warranty-related dev codes → `HUBB1400`
- Construction services → `HUBB1000`
- Trim/millwork → `HUBB1700`

Build this as a lookup table `bids.hubbell_payer_entity_lookup` keyed by
`dev_code`. Populate from the 47-development list.

**Option B (fallback):** if Payment History eventually starts showing the
payer entity, parse it directly. Not available today.

Initial backfill of `payer_entity` for the 4,879 existing rows: run
Option A retroactively across the existing `hubbell_document_payments` →
`hubbell_documents.dev_code` join.

If derivation is ambiguous (no docs on the check map to any dev_code, or
mixed), set `payer_entity = 'UNKNOWN'` and flag in the admin UI for human
resolution. Don't block ingest.

---

## 3. `source_hash` canonicalization — **agreed, explicit spec**

Replace `sha256(JSON.stringify(...))` with this exact canonicalization
(server-side, in the upload route):

```typescript
function canonicalCheckHash(check: {
  check_number: string,
  payer_entity: string,
  lines: Array<{
    doc_type: string,
    doc_number: string,
    line_seq: number,
    payment_amount: number,
    memo?: string,
    invoice_date?: string,
    gross_amount?: number,
  }>
}): string {
  // 1. Sort lines by (doc_type, doc_number, line_seq) — stable order
  const sorted = [...check.lines].sort((a, b) =>
    a.doc_type.localeCompare(b.doc_type) ||
    a.doc_number.localeCompare(b.doc_number) ||
    a.line_seq - b.line_seq
  );

  // 2. Convert all amounts to integer cents — eliminates float drift
  const normLines = sorted.map(l => ({
    doc_type: l.doc_type,
    doc_number: l.doc_number,
    line_seq: l.line_seq,
    payment_cents: Math.round(l.payment_amount * 100),
    gross_cents: l.gross_amount != null ? Math.round(l.gross_amount * 100) : null,
    memo: l.memo ?? null,
    invoice_date: l.invoice_date ?? null,
  }));

  // 3. Build canonical string — keys in fixed order, no whitespace
  const canonical = JSON.stringify({
    check_number: check.check_number,
    payer_entity: check.payer_entity,
    lines: normLines,
  });

  // 4. SHA256 hex
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
```

Deterministic across runtimes, immune to float drift, excludes
server-mutable fields.

---

## 4. Update semantics — **wipe-and-replace inside a transaction**

Replace the brief's add-only `added_lines` response. Real behavior:

```typescript
async function upsertCheck(req) {
  return await db.transaction(async tx => {
    const newHash = canonicalCheckHash(req);
    const existing = await tx.select(...).from(hubbell_checks).where(
      eq(hubbell_checks.payer_entity, req.payer_entity).and(
        eq(hubbell_checks.check_number, req.check_number)
      )
    ).limit(1);

    if (existing.length === 0) {
      const [check] = await tx.insert(hubbell_checks).values({...}).returning();
      await tx.insert(hubbell_check_lines).values(req.lines.map(...));
      return { status: 'inserted', id: check.id, line_count: req.lines.length };
    }

    if (existing[0].source_hash === newHash) {
      await tx.update(hubbell_checks).set({ last_seen_at: now() })
        .where(eq(hubbell_checks.id, existing[0].id));
      return { status: 'unchanged', id: existing[0].id };
    }

    // REPLACE path: source_hash differs → check contents changed
    await tx.delete(hubbell_check_lines).where(eq(hubbell_check_lines.check_id, existing[0].id));
    await tx.insert(hubbell_check_lines).values(req.lines.map(...));
    await tx.update(hubbell_checks).set({
      source_hash: newHash, last_seen_at: now(), total_amount: ..., payment_count: ...
    }).where(eq(hubbell_checks.id, existing[0].id));
    return { status: 'replaced', id: existing[0].id, line_count: req.lines.length };
  });
}
```

Check identity (the `id` UUID) is preserved across replaces. Rollup on
`hubbell_documents` recomputes from the new line set. Stale lines gone.

Response statuses: `inserted` | `unchanged` | `replaced` (not `updated` —
clearer signal that the line set was wholesale swapped).

---

## 5. `'inv'` doc_type resolution — **two-path resolver in read endpoint**

```typescript
function resolveLineToSO(line) {
  if (line.doc_type === 'po' || line.doc_type === 'wo') {
    // Path 1: line → hubbell_documents → hubbell_document_sos → agility_so_header
    return joinViaDocument(line);
  }
  if (line.doc_type === 'inv') {
    // Path 2: line → agility_so_header directly via ref_num
    return joinViaInvoiceNumber(line.doc_number);
  }
  return { document_id: null, attached_so_ids: [] };
}
```

Read endpoint returns the same shape for both paths — consumer doesn't
branch on doc_type, just consumes `attached_so_ids`:

```json
{
  "doc_type": "inv",
  "doc_number": "1460801",
  "payment_amount": 80.25,
  "document_id": null,
  "attached_so_ids": ["1460801"],
  "resolution_path": "ar_invoice"
}
```

---

## 6. Pagination — **cursor-based**

```
GET /api/hubbell/checks?since=YYYY-MM-DD&cursor=<opaque>&limit=200

Response:
{
  "checks": [...],
  "next_cursor": "<opaque>" | null,
  "count": 200
}
```

Cursor encodes `(last_check.check_date, last_check.id)` to handle
same-date checks deterministically. Default `limit=200`, max `1000`.

Cursor (not offset) because data is mostly append-only; offset would skip
rows on concurrent inserts. The replace case from §4 mutates existing
rows but doesn't change ordering, so cursor still works. Recon clients
can resume from a saved cursor across runs.

Same treatment for `GET /api/hubbell/docs?since=...`. NDJSON stream is an
acceptable alternative if preferred.

---

## 7. Schema-rename sequencing — **defer until after Phase 3d**

Don't do the `bids → hubbell` schema move until after Phase 3d ships and
the PC scripts are archived. Otherwise we do the codebase rewrite twice.

Sequence:
- Phase 2 + Phase 3a/b/c: ship under `bids`
- Phase 3d: retire PC scripts
- Phase 3e: `ALTER SCHEMA bids.hubbell_* SET SCHEMA hubbell` + Drizzle
  codegen update in one focused PR. No compatibility view needed at that
  point — no external consumer exists.

---

## 8. `memo` index — **drop**

`hubbell_documents` doesn't have a free-form memo field; memo lives on
`check_lines` only and isn't queried in any planned recon path. Not part
of 0026. Add later if ad-hoc accounting queries surface the need.

---

## Net schema deltas vs original brief

```sql
CREATE TABLE bids.hubbell_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_entity text NOT NULL,                    -- NEW (§2)
  check_number text NOT NULL,
  check_date date,
  total_amount numeric(14,2),
  payment_count int,
  source_hash text NOT NULL,                     -- canonical (§3)
  source_run_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payer_entity, check_number),           -- CHANGED (§2)
  UNIQUE (source_hash)
);

-- hubbell_check_lines: unchanged from original brief

CREATE TABLE bids.hubbell_payer_entity_lookup (  -- NEW (§2)
  dev_code text PRIMARY KEY,
  payer_entity text NOT NULL
);
INSERT INTO bids.hubbell_payer_entity_lookup VALUES
  ('AP', 'HUBB1200'), ('BE', 'HUBB1200'), …;     -- full mapping TBD

-- DROP hubbell_document_payments — §1 (after backfill + rollup rewrite)
```

Recon read endpoint and daily Pi scraper changes from the original brief
stand as-is, modulo canonicalization (§3), wipe-and-replace (§4), `inv`
resolver (§5), and pagination (§6).

---

## Outstanding question for the user

`dev_code → payer_entity` mapping source. The 47-development list is in
`/home/api/hubbell/hubbell_inbox/_dev_list_cache.html` on the Pi but
doesn't carry entity info. Options:

1. User provides the mapping manually (~5 min — they know which sub
   belongs to which Hubbell entity). **Recommended.**
2. Infer from `cust_shipto` joined to existing `hubbell_documents`
   (probably works for most, may have gaps).
3. Default everything to `HUBB1200` and fix exceptions as accounting
   flags them.
