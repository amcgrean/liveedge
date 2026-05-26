/**
 * Recent Movement — items whose 7-day shipped velocity diverges from
 * the trailing 30-day baseline. Powers the Recent Movement tile on
 * /purchasing/workspace and the standalone /purchasing/movement drill.
 *
 * Velocity is qty_shipped / day from customer_scorecard_fact. We compare
 * the last 7 days to days 8-37 and only return items where:
 *   • prior daily ≥ 0.25 (filters out near-zero baselines that produce
 *     enormous % changes from a single shipment)
 *   • |pct change| ≥ 25
 *   • item is stocked active in agility_item_branch for the branch
 */
import { getErpSql } from '../../../db/supabase';
import { getDb } from '../../../db/index';
import { movementNotes } from '../../../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

export interface MovementRow {
  systemId:     string;
  itemCode:     string;
  description:  string | null;
  category:     string | null;
  weeklyNow:    number;
  weeklyPrior: number;
  pctChange:    number;        // +ve = up
  dir:          'up' | 'down';
  qtyOnHand:    number;
  note:         string | null; // joined from bids.movement_notes (latest week)
}

export interface MovementFilters {
  branch?:    string | null;
  minPct?:    number;   // default 25 (absolute %)
  limit?:     number;   // default 50, max 200
  direction?: 'up' | 'down' | 'all';
}

const ALLOWED_BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

export async function fetchMovementRows(filters: MovementFilters): Promise<MovementRow[]> {
  const sql$ = getErpSql();
  const branch = filters.branch && ALLOWED_BRANCHES.includes(filters.branch) ? filters.branch : null;
  const minPct = Math.max(0, filters.minPct ?? 25);
  const limit  = Math.min(200, Math.max(1, filters.limit ?? 50));
  const dir    = filters.direction ?? 'all';

  // Read 7d vs 30d-prior usage per item × branch.
  // Driving table is the velocity result; we then JOIN agility_items for description
  // and agility_item_branch for on-hand.
  const rows = await sql$<EngineRow[]>`
    WITH velocity AS (
      SELECT
        csf.branch_id AS system_id,
        csf.item_number AS item_code,
        SUM(CASE WHEN csf.invoice_date >= now() - interval '7 days'  THEN csf.qty_shipped ELSE 0 END)::numeric  AS qty_7d,
        SUM(CASE WHEN csf.invoice_date >= now() - interval '37 days'
                  AND csf.invoice_date <  now() - interval '7 days'  THEN csf.qty_shipped ELSE 0 END)::numeric AS qty_prior_30d
      FROM customer_scorecard_fact csf
      WHERE csf.is_deleted = false
        AND csf.is_credit_memo = false
        AND csf.invoice_date >= now() - interval '37 days'
        AND csf.item_number IS NOT NULL
        ${branch ? sql$`AND csf.branch_id = ${branch}` : sql$``}
      GROUP BY csf.branch_id, csf.item_number
    ),
    scored AS (
      SELECT v.system_id, v.item_code,
        v.qty_7d,
        v.qty_prior_30d,
        -- Daily averages
        (v.qty_7d        / 7.0)::numeric  AS daily_now,
        (v.qty_prior_30d / 30.0)::numeric AS daily_prior,
        -- Convert to "weekly" units for display parity with the design
        (v.qty_7d)::numeric                          AS weekly_now,
        ((v.qty_prior_30d / 30.0) * 7.0)::numeric    AS weekly_prior,
        -- % change vs prior daily
        CASE WHEN v.qty_prior_30d / 30.0 >= 0.25 THEN
          ROUND(
            ((v.qty_7d / 7.0) - (v.qty_prior_30d / 30.0)) / (v.qty_prior_30d / 30.0) * 100,
            0
          )::int
          ELSE NULL
        END AS pct_change
      FROM velocity v
    )
    SELECT
      s.system_id, s.item_code,
      ai.description,
      ip.category,
      s.weekly_now, s.weekly_prior, s.pct_change,
      CASE WHEN s.pct_change >= 0 THEN 'up' ELSE 'down' END AS dir,
      COALESCE(ib.qty_on_hand, 0)::numeric AS qty_on_hand
    FROM scored s
    JOIN agility_items ai
      ON ai.system_id = '00CO' AND ai.item = s.item_code AND ai.is_deleted = false
    JOIN agility_item_branch ib
      ON ib.system_id = s.system_id AND ib.item_code = s.item_code
      AND ib.is_deleted = false AND ib.active_flag = true AND ib.stock = true
    LEFT JOIN bids.item_planning ip
      ON ip.system_id = s.system_id AND ip.item_code = s.item_code
    WHERE s.pct_change IS NOT NULL
      AND ABS(s.pct_change) >= ${minPct}
      ${dir === 'up'   ? sql$`AND s.pct_change > 0` : sql$``}
      ${dir === 'down' ? sql$`AND s.pct_change < 0` : sql$``}
    ORDER BY ABS(s.pct_change) DESC, s.system_id, s.item_code
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  // Pull latest movement_notes for these items in one Drizzle query.
  // Index on (system_id, item_code, week_starting DESC) makes this cheap.
  const db = getDb();
  const keys = rows.map((r) => ({ systemId: r.system_id, itemCode: r.item_code }));
  const noteRows = await db
    .select({
      systemId: movementNotes.systemId,
      itemCode: movementNotes.itemCode,
      note: movementNotes.note,
      weekStarting: movementNotes.weekStarting,
    })
    .from(movementNotes)
    .where(
      and(
        inArray(movementNotes.systemId, [...new Set(keys.map((k) => k.systemId))]),
        inArray(movementNotes.itemCode, [...new Set(keys.map((k) => k.itemCode))]),
      ),
    )
    .orderBy(sql`week_starting DESC`);

  // Pick the most recent note per (system_id, item_code).
  const notesByKey = new Map<string, string>();
  for (const n of noteRows) {
    const k = `${n.systemId}::${n.itemCode}`;
    if (!notesByKey.has(k)) notesByKey.set(k, n.note);
  }

  return rows.map((r) => ({
    systemId:    r.system_id,
    itemCode:    r.item_code,
    description: r.description,
    category:    r.category,
    weeklyNow:   Number(r.weekly_now) || 0,
    weeklyPrior: Number(r.weekly_prior) || 0,
    pctChange:   Number(r.pct_change) || 0,
    dir:         r.dir,
    qtyOnHand:   Number(r.qty_on_hand) || 0,
    note:        notesByKey.get(`${r.system_id}::${r.item_code}`) ?? null,
  }));
}

type EngineRow = {
  system_id: string; item_code: string;
  description: string | null;
  category: string | null;
  weekly_now: string; weekly_prior: string; pct_change: number;
  dir: 'up' | 'down';
  qty_on_hand: string;
};
