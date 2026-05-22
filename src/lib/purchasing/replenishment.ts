/**
 * Replenishment engine — computes per-item buying urgency from on-hand,
 * usage history, open demand, open supply, lead times, and LiveEdge planning
 * overrides. Powers /purchasing/suggested-buys (rebuilt) and /purchasing/outages.
 *
 * Read order for any item × branch:
 *   bids.item_planning override → bids.branch_planning_defaults → engine fallback
 *
 * Severity buckets (per CLAUDE.md design):
 *   red    = coverage_days <= lead_time_1
 *   amber  = coverage_days <= lead_time_1 + safety_stock_days
 *   yellow = coverage_days <= lead_time_1 + safety_stock_days + 14
 *   green  = otherwise
 *
 * Items with no usage history go green unless they breach `min_on_hand`,
 * in which case they go amber.
 *
 * The whole computation runs in a single CTE-based SQL query against the
 * `public` (ERP) schema with a join to `bids.item_planning` /
 * `bids.branch_planning_defaults` for overrides.
 */
import { getErpSql } from '../../../db/supabase';

export type Severity = 'red' | 'amber' | 'yellow' | 'green';
export type ReplenishmentView = 'suggested' | 'outages' | 'all';

export interface ReplenishmentRow {
  systemId:           string;
  itemCode:           string;
  itemPtr:            number | null;
  description:        string | null;
  productMajor:       string | null;
  productMinor:       string | null;
  stockingUom:        string | null;
  defaultLocation:    string | null;
  category:           string | null;
  isCritical:         boolean;
  notes:              string | null;

  qtyOnHand:          number;
  openDemandQty:      number;
  openSupplyQty:      number;
  effectiveOnHand:    number;

  usagePerDay:        number;
  usageWindowDays:    number;
  seasonalityFactor:  number;
  coverageDays:       number | null;

  leadTimeDays:       number | null;
  safetyStockDays:    number;
  minOnHand:          number | null;
  targetOnHand:       number | null;
  packQty:            number | null;

  supplierCode:       string | null;
  supplierName:       string | null;
  shipFromSeq:        number | null;
  minOrderQty:        number | null;
  minPak:             number | null;
  minOrderUom:        string | null;
  minOrderViolation:  string | null;

  severity:           Severity;
  suggestedQty:       number;
}

export interface ReplenishmentFilters {
  branch?:       string | null;
  category?:     string | null;
  supplier?:     string | null;
  view?:         ReplenishmentView;
  criticalOnly?: boolean;
  search?:       string;
  limit?:        number;
}

const ALLOWED_BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

export async function fetchReplenishmentRows(
  filters: ReplenishmentFilters,
): Promise<ReplenishmentRow[]> {
  const sql = getErpSql();
  const branch       = filters.branch && ALLOWED_BRANCHES.includes(filters.branch) ? filters.branch : null;
  const category     = filters.category?.trim() || null;
  const supplier     = filters.supplier?.trim() || null;
  const view         = filters.view ?? 'suggested';
  const criticalOnly = !!filters.criticalOnly;
  const search       = (filters.search ?? '').trim();
  const limit        = Math.min(2000, Math.max(1, filters.limit ?? 500));

  const severityIn =
    view === 'suggested' ? ['red', 'amber']
    : view === 'outages'  ? ['red', 'amber', 'yellow']
    : null;

  const rows = await sql<EngineRow[]>`
    WITH itemverse AS (
      SELECT
        ib.system_id,
        ib.item_code,
        ai.item_ptr,
        ai.description,
        ai.product_major,
        ai.product_minor,
        ai.stocking_uom,
        ib.default_location,
        ib.qty_on_hand::numeric                                            AS qty_on_hand,
        COALESCE(ip.usage_window_days, bd.usage_window_days, 90)::int      AS usage_window_days,
        COALESCE(ip.safety_stock_days, bd.safety_stock_days, 7)::int       AS safety_stock_days,
        COALESCE(ip.seasonality_factor::numeric, 1.0)::numeric             AS seasonality_factor,
        ip.min_on_hand::numeric                                            AS min_on_hand,
        ip.target_on_hand::numeric                                         AS target_on_hand,
        ip.pack_qty::numeric                                               AS pack_qty,
        ip.preferred_supplier,
        COALESCE(ip.is_critical, false)                                    AS is_critical,
        ip.category,
        ip.notes
      FROM agility_item_branch ib
      -- agility_items.system_id is the company code ('00CO') — adding it to
      -- the join lets the (system_id, item) composite index drive the lookup
      -- instead of a full seq scan over ~178k items.
      JOIN agility_items ai
        ON ai.system_id = '00CO'
        AND ai.item = ib.item_code
        AND ai.is_deleted = false
      LEFT JOIN bids.item_planning ip
        ON ip.system_id = ib.system_id AND ip.item_code = ib.item_code
      LEFT JOIN bids.branch_planning_defaults bd
        ON bd.system_id = ib.system_id
      WHERE ib.is_deleted = false
        AND ib.active_flag = true
        AND ib.stock = true
        AND LOWER(COALESCE(ai.discontinued_item, '')) NOT IN ('yes', 'y')
        AND COALESCE(ip.is_paused, false) = false
        ${branch       ? sql`AND ib.system_id = ${branch}`                     : sql``}
        ${category     ? sql`AND ip.category   = ${category}`                  : sql``}
        ${criticalOnly ? sql`AND COALESCE(ip.is_critical, false) = true`       : sql``}
        ${search ? sql`AND (
          ib.item_code ILIKE ${'%' + search + '%'}
          OR ai.description ILIKE ${'%' + search + '%'}
        )` : sql``}
    ),
    supplier_rules AS (
      -- Pick one rule row per (system_id, item_ptr) — preferred supplier wins
      -- if set on bids.item_planning, else is_primary, else shortest lead time.
      -- We DON'T join agility_suppliers here; the supplier name lookup is
      -- deferred to the outer SELECT after severity filtering reduces row
      -- count, so the (TRIM) expression join only runs on survivors.
      SELECT DISTINCT ON (iv.system_id, iv.item_ptr)
        iv.system_id, iv.item_ptr,
        TRIM(ims.supplier_key)  AS supplier_key_trimmed,
        ims.ship_from_seq_num,
        ims.lead_time_1,
        ims.min_ord_qty::numeric                AS min_ord_qty,
        ims.min_pak::numeric                    AS min_pak,
        ims.min_ord_qty_disp_uom                AS min_ord_uom,
        ims.min_ord_violation                   AS min_ord_violation,
        ims.is_primary,
        iv.preferred_supplier
      FROM itemverse iv
      LEFT JOIN agility_item_supplier ims
        ON ims.system_id = iv.system_id
        AND ims.item_ptr = iv.item_ptr
        AND ims.is_deleted = false
      ORDER BY iv.system_id, iv.item_ptr,
        ims.is_primary DESC NULLS LAST,
        ims.lead_time_1 ASC NULLS LAST
    ),
    usage AS (
      -- LATERAL subquery so the (branch_id, item_number, invoice_date)
      -- index drives one quick index scan per item rather than a single
      -- seq scan over the whole fact table.
      SELECT iv.system_id, iv.item_code,
        (COALESCE(u.qty_sum, 0)::numeric / NULLIF(iv.usage_window_days, 0)::numeric)::numeric AS usage_per_day
      FROM itemverse iv
      LEFT JOIN LATERAL (
        SELECT SUM(csf.qty_shipped)::numeric AS qty_sum
        FROM customer_scorecard_fact csf
        WHERE csf.branch_id = iv.system_id
          AND csf.item_number = iv.item_code
          AND csf.invoice_date >= (now() - make_interval(days => iv.usage_window_days))
          AND csf.is_deleted = false
          AND csf.is_credit_memo = false
      ) u ON true
    ),
    open_demand AS (
      -- Pre-aggregated per (system_id, item_ptr) over the branch's open SO
      -- universe. Joining to itemverse afterwards by (system_id, item_ptr)
      -- is much faster than per-item subqueries against the full so_lines.
      SELECT sol.system_id, sol.item_ptr,
        SUM(GREATEST(0, sol.qty_ordered - COALESCE(sol.qty_shipped, 0)))::numeric AS open_qty
      FROM agility_so_lines sol
      JOIN agility_so_header soh
        ON soh.system_id = sol.system_id
        AND soh.so_id    = sol.so_id
        AND soh.is_deleted = false
        AND soh.so_status IN ('B', 'S')
        AND COALESCE(soh.sale_type, '') NOT IN ('Credit', 'Hold')
      WHERE sol.is_deleted = false
        ${branch ? sql`AND sol.system_id = ${branch}` : sql``}
      GROUP BY sol.system_id, sol.item_ptr
    ),
    open_supply AS (
      -- Same pattern. We intentionally don't apply a lead-time-based date
      -- gate here — that would force a per-item nested loop and 10× the
      -- query time. Open PO qty represents committed supply that WILL
      -- arrive; counting it always is the safe default (slight under-
      -- suggestion for items with very-far-future POs vs. unfiltered).
      SELECT pol.system_id, pol.item_ptr,
        SUM(GREATEST(0, pol.qty_ordered - COALESCE(recv.received, 0)))::numeric AS open_qty
      FROM agility_po_lines pol
      JOIN agility_po_header poh
        ON poh.system_id = pol.system_id
        AND poh.po_id    = pol.po_id
        AND poh.is_deleted = false
        AND poh.po_status IN ('Open', 'In Process')
      LEFT JOIN LATERAL (
        SELECT SUM(rl.qty) AS received
        FROM agility_receiving_lines rl
        WHERE rl.system_id = pol.system_id
          AND rl.po_id     = pol.po_id
          AND rl.sequence  = pol.sequence
          AND rl.is_deleted = false
      ) recv ON true
      WHERE pol.is_deleted = false
        AND pol.canceled   = false
        ${branch ? sql`AND pol.system_id = ${branch}` : sql``}
      GROUP BY pol.system_id, pol.item_ptr
    ),
    computed AS (
      SELECT
        iv.system_id, iv.item_code, iv.item_ptr,
        iv.description, iv.product_major, iv.product_minor,
        iv.stocking_uom, iv.default_location, iv.category,
        iv.is_critical, iv.notes,

        iv.qty_on_hand,
        COALESCE(od.open_qty, 0)::numeric AS open_demand_qty,
        COALESCE(os.open_qty, 0)::numeric AS open_supply_qty,
        (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0))::numeric AS effective_on_hand,

        COALESCE(u.usage_per_day, 0)::numeric AS usage_per_day,
        iv.usage_window_days,
        iv.seasonality_factor,
        iv.safety_stock_days,

        sr.lead_time_1                          AS lead_time_days,
        sr.supplier_key_trimmed, sr.ship_from_seq_num,
        sr.min_ord_qty, sr.min_pak, sr.min_ord_uom, sr.min_ord_violation,

        iv.min_on_hand, iv.target_on_hand, iv.pack_qty,

        CASE WHEN COALESCE(u.usage_per_day, 0) * iv.seasonality_factor > 0
             THEN (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0))
                  / (u.usage_per_day * iv.seasonality_factor)
             ELSE NULL
        END::numeric AS coverage_days,

        CASE
          WHEN COALESCE(u.usage_per_day, 0) * iv.seasonality_factor <= 0 THEN
            CASE WHEN iv.min_on_hand IS NOT NULL
                  AND (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0)) < iv.min_on_hand
                 THEN 'amber' ELSE 'green' END
          WHEN (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0))
               / (u.usage_per_day * iv.seasonality_factor)
               <= COALESCE(sr.lead_time_1, 30) THEN 'red'
          WHEN (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0))
               / (u.usage_per_day * iv.seasonality_factor)
               <= COALESCE(sr.lead_time_1, 30) + iv.safety_stock_days THEN 'amber'
          WHEN (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0))
               / (u.usage_per_day * iv.seasonality_factor)
               <= COALESCE(sr.lead_time_1, 30) + iv.safety_stock_days + 14 THEN 'yellow'
          ELSE 'green'
        END AS severity,

        -- Suggested order qty:
        --   target = item.target_on_hand if set, else (lead+safety+14) days of demand
        --   gap    = max(0, target - effective_on_hand)
        --   pack   = first non-null of (item.pack_qty, supplier.min_pak, 1)
        --   rounded = ceil(gap / pack) * pack
        --   final  = max(rounded, min_ord_qty)
        GREATEST(
          ceil(
            GREATEST(0,
              COALESCE(iv.target_on_hand,
                (COALESCE(sr.lead_time_1, 30) + iv.safety_stock_days + 14)
                * COALESCE(u.usage_per_day, 0) * iv.seasonality_factor
              )
              - (iv.qty_on_hand + COALESCE(os.open_qty, 0) - COALESCE(od.open_qty, 0))
            )
            / NULLIF(COALESCE(iv.pack_qty, sr.min_pak, 1), 0)
          ) * COALESCE(iv.pack_qty, sr.min_pak, 1),
          COALESCE(sr.min_ord_qty, 0)
        )::numeric AS suggested_qty
      FROM itemverse iv
      LEFT JOIN supplier_rules sr ON sr.system_id = iv.system_id AND sr.item_ptr = iv.item_ptr
      LEFT JOIN usage u            ON u.system_id  = iv.system_id AND u.item_code  = iv.item_code
      LEFT JOIN open_demand od     ON od.system_id = iv.system_id AND od.item_ptr  = iv.item_ptr
      LEFT JOIN open_supply os     ON os.system_id = iv.system_id AND os.item_ptr  = iv.item_ptr
    ),
    filtered AS (
      SELECT * FROM computed
      WHERE 1=1
        ${severityIn ? sql`AND severity = ANY(${severityIn}::text[])` : sql``}
        ${view === 'outages' ? sql`AND usage_per_day > 0` : sql``}
    )
    -- Final SELECT resolves supplier_code + name only for surviving rows.
    -- The (TRIM(supplier_key), ship_from_seq) expression index drives this
    -- as a single index lookup per row.
    SELECT
      f.*,
      s.supplier_code,
      COALESCE(s.ship_from_name, s.supplier_name) AS supplier_name,
      s.ship_from_seq
    FROM filtered f
    LEFT JOIN agility_suppliers s
      ON TRIM(s.supplier_key) = f.supplier_key_trimmed
     AND s.ship_from_seq = f.ship_from_seq_num
     AND s.is_deleted = false
    WHERE 1=1
      ${supplier ? sql`AND s.supplier_code = ${supplier}` : sql``}
    ORDER BY
      CASE f.severity
        WHEN 'red'    THEN 1
        WHEN 'amber'  THEN 2
        WHEN 'yellow' THEN 3
        ELSE 4
      END,
      f.coverage_days ASC NULLS LAST,
      f.item_code
    LIMIT ${limit}
  `;

  return rows.map(mapRow);
}

type EngineRow = {
  system_id: string; item_code: string; item_ptr: number | null;
  description: string | null; product_major: string | null; product_minor: string | null;
  stocking_uom: string | null; default_location: string | null; category: string | null;
  is_critical: boolean; notes: string | null;
  qty_on_hand: string; open_demand_qty: string; open_supply_qty: string; effective_on_hand: string;
  usage_per_day: string; usage_window_days: number; seasonality_factor: string; safety_stock_days: number;
  lead_time_days: number | null;
  supplier_code: string | null; supplier_name: string | null; ship_from_seq: number | null;
  min_ord_qty: string | null; min_pak: string | null; min_ord_uom: string | null; min_ord_violation: string | null;
  min_on_hand: string | null; target_on_hand: string | null; pack_qty: string | null;
  coverage_days: string | null; severity: Severity; suggested_qty: string;
};

function n(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function nOrNull(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function mapRow(r: EngineRow): ReplenishmentRow {
  return {
    systemId: r.system_id, itemCode: r.item_code, itemPtr: r.item_ptr,
    description: r.description, productMajor: r.product_major, productMinor: r.product_minor,
    stockingUom: r.stocking_uom, defaultLocation: r.default_location, category: r.category,
    isCritical: !!r.is_critical, notes: r.notes,

    qtyOnHand:       n(r.qty_on_hand),
    openDemandQty:   n(r.open_demand_qty),
    openSupplyQty:   n(r.open_supply_qty),
    effectiveOnHand: n(r.effective_on_hand),

    usagePerDay:       n(r.usage_per_day),
    usageWindowDays:   r.usage_window_days ?? 90,
    seasonalityFactor: n(r.seasonality_factor) || 1.0,
    coverageDays:      nOrNull(r.coverage_days),

    leadTimeDays:    r.lead_time_days,
    safetyStockDays: r.safety_stock_days ?? 7,
    minOnHand:       nOrNull(r.min_on_hand),
    targetOnHand:    nOrNull(r.target_on_hand),
    packQty:         nOrNull(r.pack_qty),

    supplierCode:      r.supplier_code,
    supplierName:      r.supplier_name,
    shipFromSeq:       r.ship_from_seq,
    minOrderQty:       nOrNull(r.min_ord_qty),
    minPak:            nOrNull(r.min_pak),
    minOrderUom:       r.min_ord_uom,
    minOrderViolation: r.min_ord_violation,

    severity:     r.severity,
    suggestedQty: n(r.suggested_qty),
  };
}

/**
 * Roll up the row set by supplier — used by the rebuilt Suggested Buys page
 * so a buyer can assemble one PO per vendor.
 */
export interface SupplierRollup {
  supplierCode: string | null;
  supplierName: string | null;
  rowCount: number;
  redCount: number;
  amberCount: number;
  totalSuggestedQty: number;
}

export function buildSupplierRollup(rows: ReplenishmentRow[]): SupplierRollup[] {
  const map = new Map<string, SupplierRollup>();
  for (const r of rows) {
    const key = r.supplierCode ?? 'unknown';
    let entry = map.get(key);
    if (!entry) {
      entry = {
        supplierCode: r.supplierCode,
        supplierName: r.supplierName,
        rowCount: 0,
        redCount: 0,
        amberCount: 0,
        totalSuggestedQty: 0,
      };
      map.set(key, entry);
    }
    entry.rowCount++;
    entry.totalSuggestedQty += r.suggestedQty;
    if (r.severity === 'red')   entry.redCount++;
    if (r.severity === 'amber') entry.amberCount++;
  }
  return [...map.values()].sort(
    (a, b) => b.redCount - a.redCount || b.amberCount - a.amberCount,
  );
}
