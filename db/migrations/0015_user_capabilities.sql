-- Per-user capability grants/revokes for the access-control system.
-- Phase 1 of the access-control upgrade. Apply in Supabase SQL editor.
--
-- Roles continue to provide default capability sets (see
-- src/lib/access-control.ts ROLE_DEFAULTS). These two arrays let an admin
-- additively grant a capability the user's roles don't include, or revoke
-- one the roles do include — without having to re-type the user.
--
-- Default '{}' on every existing row keeps behavior unchanged after apply.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS granted_capabilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS revoked_capabilities text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.app_users.granted_capabilities IS
  'Capability codes granted in addition to role defaults. See src/lib/access-control.ts CAPABILITIES.';
COMMENT ON COLUMN public.app_users.revoked_capabilities IS
  'Capability codes removed from role defaults for this user.';
