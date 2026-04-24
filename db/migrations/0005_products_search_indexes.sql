-- Product group browse index
CREATE INDEX IF NOT EXISTS idx_agility_items_product_group
  ON public.agility_items (link_product_group)
  WHERE is_deleted = false;

-- Branch filter index
CREATE INDEX IF NOT EXISTS idx_agility_items_system_id
  ON public.agility_items (system_id)
  WHERE is_deleted = false;

-- Composite for group + branch browse
CREATE INDEX IF NOT EXISTS idx_agility_items_group_branch
  ON public.agility_items (link_product_group, system_id)
  WHERE is_deleted = false;

-- Live data currently has no populated link_product_group values, so the app
-- falls back to handling_code for browse tiles until ERP group data is filled.
CREATE INDEX IF NOT EXISTS idx_agility_items_handling_branch
  ON public.agility_items (handling_code, system_id)
  WHERE is_deleted = false;

-- Full-text search index on available product fields.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agility_items'
      AND column_name = 'primary_supplier'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_agility_items_fts
        ON public.agility_items
        USING GIN (
          to_tsvector('english',
            coalesce(item, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce(ext_description, '') || ' ' ||
            coalesce(short_des, '') || ' ' ||
            coalesce(size_, '') || ' ' ||
            coalesce(type, '') || ' ' ||
            coalesce(stocking_uom, '') || ' ' ||
            coalesce(link_product_group, '') || ' ' ||
            coalesce(handling_code, '') || ' ' ||
            coalesce(default_location, '') || ' ' ||
            coalesce(primary_supplier, '')
          )
        )
        WHERE is_deleted = false
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_agility_items_fts
        ON public.agility_items
        USING GIN (
          to_tsvector('english',
            coalesce(item, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce(ext_description, '') || ' ' ||
            coalesce(short_des, '') || ' ' ||
            coalesce(size_, '') || ' ' ||
            coalesce(type, '') || ' ' ||
            coalesce(stocking_uom, '') || ' ' ||
            coalesce(link_product_group, '') || ' ' ||
            coalesce(handling_code, '') || ' ' ||
            coalesce(default_location, '')
          )
        )
        WHERE is_deleted = false
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agility_items'
      AND column_name = 'product_major_code'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agility_items_major_code
      ON public.agility_items (product_major_code, system_id)
      WHERE is_deleted = false';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agility_items'
      AND column_name = 'product_minor_code'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agility_items_minor_code
      ON public.agility_items (product_minor_code, system_id)
      WHERE is_deleted = false';
  END IF;
END $$;
