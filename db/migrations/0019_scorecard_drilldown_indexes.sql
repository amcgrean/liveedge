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
-- Vendor 3-year chart and YTD/PY KPIs filter by (supplier_key, receive_date).
-- Branch & Mix tab groups receipts by system_id. Vendor item drilldown joins
-- receiving_lines to receiving_header via (system_id, po_id, receive_num).

CREATE INDEX IF NOT EXISTS idx_agility_recv_header_supplier_date
  ON public.agility_receiving_header (supplier_key, receive_date DESC NULLS LAST)
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
-- and reverse lookup (which items does this vendor primarily supply) iterates
-- by primary_supplier. Partial index keeps it tight on the populated subset.

CREATE INDEX IF NOT EXISTS idx_agility_items_primary_supplier
  ON public.agility_items (primary_supplier)
  WHERE primary_supplier IS NOT NULL;
