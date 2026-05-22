-- 0028_item_planning.sql
-- LiveEdge-managed item replenishment policy overrides.
--
-- Powers the rebuilt /purchasing/suggested-buys and the new
-- /purchasing/outages views. Agility's per-item min/max/safety-stock
-- fields do not behave the way Beisser needs (especially for Millwork);
-- LiveEdge owns the planning policy and uses Agility purely as the
-- source of truth for stock, demand, and supply data.
--
-- See docs/buyers-workspace-plan-2026-05-22.md for the design.
-- Apply manually in Supabase SQL editor.

-- ----------------------------------------------------------------------
-- Branch-level defaults. One row per system_id. Fall through to hardcoded
-- engine defaults when missing (usage_window_days=90, safety_stock_days=7).
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bids.branch_planning_defaults (
  system_id              text PRIMARY KEY,                        -- e.g. '20GR'
  usage_window_days      integer NOT NULL DEFAULT 90,              -- demand lookback
  safety_stock_days      integer NOT NULL DEFAULT 7,               -- buffer beyond lead time

  -- Optional 12-element jsonb array of monthly multipliers
  -- (e.g. [0.7, 0.7, 1.0, 1.3, 1.4, 1.4, 1.3, 1.2, 1.1, 1.0, 0.8, 0.7]).
  -- NULL = no seasonal adjustment at the branch level. Individual items
  -- can override via item_planning.seasonality_profile.
  seasonality_profile    jsonb,

  updated_by             text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- Per-item planning overrides. Sparse — a row only exists where someone
-- has set at least one override. The engine reads the row and merges
-- non-NULL fields over the branch defaults + Agility fallbacks.
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bids.item_planning (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id              text NOT NULL,                            -- branch
  item_code              text NOT NULL,                            -- agility_items.item

  -- Reorder policy. All NULL-able so an override row can carry just one field.
  min_on_hand            numeric,                                  -- floor; below = outage risk
  target_on_hand         numeric,                                  -- reorder-up-to (max)
  safety_stock_days      integer,                                  -- per-item override of branch default
  usage_window_days      integer,                                  -- per-item override of branch default

  -- Seasonality.
  -- seasonality_factor: simple constant multiplier on baseline usage
  --   (1.5 = "sells 50% more than baseline" — useful for items in a
  --   ramp without monthly noise).
  -- seasonality_profile: optional 12-element jsonb array of monthly
  --   multipliers, overriding the branch profile for this item.
  seasonality_factor     numeric,
  seasonality_profile    jsonb,

  -- Order step. Engine rounds suggested qty up to a multiple of pack_qty
  -- when set; falls back to agility_item_supplier.min_pak otherwise.
  pack_qty               numeric,

  -- Preferred supplier override (Agility's is_primary may not match what
  -- Beisser actually buys from). Maps to agility_suppliers.supplier_code.
  preferred_supplier     text,

  -- Classification.
  is_critical            boolean NOT NULL DEFAULT false,            -- bumps severity in outage view
  category               text,                                      -- 'millwork','lumber','siding'... for filtering
  is_paused              boolean NOT NULL DEFAULT false,            -- exclude from suggestions (NPI, phase-out)

  -- Provenance.
  notes                  text,
  -- 'manual' | 'csv_import' | 'admin_suggestion' — how this row got created.
  -- Drives audit/diagnostic views ("show me everything imported from the
  -- 2026-Q2 Millwork template" etc.).
  source                 text NOT NULL DEFAULT 'manual',
  updated_by             text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (system_id, item_code)
);

-- Hot paths:
--   • Engine joins by (system_id, item_code) — covered by the UNIQUE.
--   • Admin UI filters by category / critical / paused.
CREATE INDEX IF NOT EXISTS item_planning_category_idx
  ON bids.item_planning (system_id, category)
  WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS item_planning_critical_idx
  ON bids.item_planning (system_id)
  WHERE is_critical = true;

CREATE INDEX IF NOT EXISTS item_planning_paused_idx
  ON bids.item_planning (system_id)
  WHERE is_paused = true;
