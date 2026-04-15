/**
 * db/migrate-users-to-app-users.ts
 *
 * Reference only — this migration was executed directly via SQL on 2026-04-15.
 *
 * Context: public.app_users was pre-populated by WH-Tracker with 70 users
 * (username, email, branch, roles, estimating_user_id all set). The only step
 * needed was backfilling password_hash from the bcrypt hashes in bids."user".
 *
 * Steps applied in Supabase SQL editor:
 *
 *   -- 1. Hash any remaining plaintext passwords in the legacy table
 *   UPDATE bids."user"
 *   SET password = crypt(password, gen_salt('bf', 12))
 *   WHERE password NOT LIKE '$2%';
 *
 *   -- 2. Backfill password_hash in app_users using estimating_user_id as join key
 *   UPDATE public.app_users au
 *   SET password_hash = u.password
 *   FROM bids."user" u
 *   WHERE au.estimating_user_id = u.id;
 *
 * Result: 69/70 rows in app_users now have password_hash set.
 * The remaining row (po-test) has estimating_user_id = NULL (OTP-only user) — expected.
 *
 * Verify with:
 *   SELECT
 *     COUNT(*) FILTER (WHERE password_hash LIKE '$2%') AS bcrypt_filled,
 *     COUNT(*) FILTER (WHERE password_hash IS NULL)    AS still_null,
 *     COUNT(*)                                          AS total
 *   FROM public.app_users;
 */

export {};
