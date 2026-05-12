-- Performance indexes for Scorecard drill-down pages (product major/minor/item, vendor scorecard).
-- Apply manually in Supabase SQL editor — NOT via drizzle-kit (public schema).
-- Note: Supabase wraps statements in a transaction, so omit CONCURRENTLY.

-- ─── customer_scorecard_fact — product drill-down ────────────────────────────
-- Item-level scorecard 3-year chart, KPIs, and top-customers query all filter by
-- (item_number, invoice_date). Major and minor drill-down pages filter by
-- (product_major_code [, product_minor_code], invoice_date). Branch-scoped
-- variants are needed for the branch filter on each drill-down page.
-- Note: the SKU column on customer_scorecard_fact is `item_number` (not
-- `item_code` as it is on agility_items); see existing queries in
-- src/lib/scorecard/queries.ts (e.g. _fetchProductItems) for confirmation.

CREATE INDEX IF NOT EXISTS idx_csf_item_date
  ON public.customer_scorecard_fact (item_number, invoice_date DESC NULLS LAST)
  WHERE is_deleted = false AND item_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csf_major_date
  ON public.customer_scorecard_fact (product_major_code, invoice_date DESC NULLS LAST)
  WHERE is_deleted = false AND product_major_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csf_major_minor_date
  ON public.customer_scorecard_fact (product_major_code, product_minor_code, invoice_date DESC NULLS LAST)
  WHERE is_deleted = false AND product_minor_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_csf_branch_item_date
  ON public.customer_scorecard_fact (branch_id, item_number, invoice_date DESC NULLS LAST)
  WHERE is_deleted = false AND item_number IS NOT NULL;

-- ─── agility_receiving_header / agility_receiving_lines — vendor scorecard ──
-- Vendor 3-year chart and YTD/PY KPIs filter by (receive_date) and optionally
-- (system_id) on agility_receiving_header. The supplier filter happens on the
-- joined agility_po_header (supplier_key lives there, not on the receiving
-- header), so the per-supplier path uses idx_agility_po_header_supplier_status
-- below; the receiving-side indexes only need to cover the date range CTE.
-- Vendor item drilldown joins receiving_lines to receiving_header via
-- (system_id, po_id, receive_num).

CREATE INDEX IF NOT EXISTS idx_agility_recv_header_date
  ON public.agility_receiving_header (receive_date DESC NULLS LAST)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_agility_recv_header_branch_date
  ON public.agility_receiving_header (system_id, receive_date DESC NULLS LAST)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_agility_recv_lines_po
  ON public.agility_receiving_lines (system_id, po_id, receive_num)
  WHERE is_deleted = false;

-- ─── agility_po_header — vendor open POs / risk-flag lookup ─────────────────
-- "Open POs" KPI and the no-recent-receipts risk flag both filter PO header
-- by (supplier_key, po_status). Expect_date is included for forecast joins.

CREATE INDEX IF NOT EXISTS idx_agility_po_header_supplier_status
  ON public.agility_po_header (supplier_key, po_status, expect_date)
  WHERE is_deleted = false;

-- ─── agility_items — item → primary supplier cross-link ─────────────────────
-- Item scorecard "Primary Supplier" card resolves agility_items.primary_supplier
-- (or .primary_supplier_key on newer sync builds) and reverse lookup (which
-- items does this vendor primarily supply) iterates by that column. Both
-- columns are optional — sync builds differ. Wrapped in DO/EXECUTE so the
-- whole migration succeeds on schemas that have neither column; the
-- application code (fetchItemPrimarySupplier) defensively checks
-- information_schema before referencing them at query time.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agility_items'
      AND column_name = 'primary_supplier'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agility_items_primary_supplier
      ON public.agility_items (primary_supplier)
      WHERE primary_supplier IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agility_items'
      AND column_name = 'primary_supplier_key'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agility_items_primary_supplier_key
      ON public.agility_items (primary_supplier_key)
      WHERE primary_supplier_key IS NOT NULL';
  END IF;
END $$;
