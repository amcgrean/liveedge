-- Drop obsolete agility_items.primary_supplier indexes.
-- Apply manually in Supabase SQL editor — NOT via drizzle-kit (public schema).
--
-- These indexes (from 0019) targeted agility_items.primary_supplier /
-- .primary_supplier_key, which were the previous (incomplete) source for the
-- item scorecard's Primary Supplier card. They are now superseded by the
-- agility_item_supplier mirror table — fetchItemPrimarySupplier and the new
-- fetchItemSuppliers join agility_items → agility_item_supplier → agility_suppliers
-- using idx_agility_item_supplier_primary (created by the sync worker).
--
-- DROP IF EXISTS is safe even if the index was never created (e.g. because the
-- partial-index column didn't exist on this schema).

DROP INDEX IF EXISTS public.idx_agility_items_primary_supplier;
DROP INDEX IF EXISTS public.idx_agility_items_primary_supplier_key;
