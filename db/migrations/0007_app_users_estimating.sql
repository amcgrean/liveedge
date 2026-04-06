-- Migration: Estimating users → OTP login
-- Applied: manually in Supabase SQL editor (public schema, not managed by drizzle-kit)
--
-- No schema changes required — public.app_users already has a roles text[] column
-- that accepts any role name including 'estimating'.
--
-- To populate estimating users, run the seed script:
--   npx tsx db/migrate-estimators-to-otp.ts
--
-- This upserts all active is_estimator/is_admin users from bids."user" into
-- public.app_users with roles=['estimating'] or roles=['admin'], keyed by email.
--
-- Verify after running:
--   SELECT email, display_name, roles FROM app_users
--   WHERE 'estimating' = ANY(roles) OR 'admin' = ANY(roles)
--   ORDER BY email;

-- Optional: add a comment to the roles column for documentation.
COMMENT ON COLUMN public.app_users.roles IS
  'User role array. Known values: admin, ops, sales, supervisor, purchasing, warehouse, estimating';
