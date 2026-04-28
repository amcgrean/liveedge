-- Full-text search GIN index on agility_items master columns.
-- Checks for optional columns (primary_supplier) at runtime.
DO $$
DECLARE
  has_primary_supplier boolean;
  fts_expr text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agility_items'
      AND column_name = 'primary_supplier'
  ) INTO has_primary_supplier;

  fts_expr :=
    $s$ coalesce(item, '') || ' ' ||
        coalesce(description, '') || ' ' ||
        coalesce(ext_description, '') || ' ' ||
        coalesce(short_des, '') || ' ' ||
        coalesce(type, '') || ' ' ||
        coalesce(stocking_uom, '') $s$;

  IF has_primary_supplier THEN
    fts_expr := fts_expr || $s$ || ' ' || coalesce(primary_supplier, '') $s$;
  END IF;

  EXECUTE format(
    $sql$
      CREATE INDEX IF NOT EXISTS idx_agility_items_fts
        ON public.agility_items
        USING GIN (to_tsvector('english', %s))
        WHERE is_deleted = false
    $sql$,
    fts_expr
  );
END $$;

-- Index on agility_items for product hierarchy browsing.
-- Tile queries GROUP BY product_major_code / product_minor_code on this table.
DROP INDEX IF EXISTS public.idx_agility_items_group_browse;
CREATE INDEX IF NOT EXISTS idx_agility_items_major_browse
  ON public.agility_items (product_major_code, product_minor_code)
  WHERE product_major_code IS NOT NULL;

-- Index on agility_item_branch for fast branch-scoped item lookups.
-- The IN subquery (item IN SELECT item_code FROM agility_item_branch WHERE system_id=?)
-- and the JOIN both benefit from this.
CREATE INDEX IF NOT EXISTS idx_agility_item_branch_branch
  ON public.agility_item_branch (system_id, item_code)
  WHERE is_deleted = false AND active_flag = true AND stock = true;
