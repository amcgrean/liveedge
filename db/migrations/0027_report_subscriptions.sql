-- 0027_report_subscriptions.sql
-- Email subscriptions to reports (sales, delivery, scorecard overview).
-- See CLAUDE.md "Pending Actions" + /root/.claude/plans/i-d-like-themes-reports-abstract-toucan.md
--
-- Apply manually in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS bids.report_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner. user_id is the app_users.id (integer in public.app_users).
  -- We don't FK across schemas; just store the id and rely on app-level
  -- bookkeeping. email is resolved at creation time but the cron re-resolves
  -- it on each send so updates to app_users.email propagate naturally.
  user_id         integer NOT NULL,
  email           text NOT NULL,

  -- Which report this subscription points at. One of:
  --   'sales-reports'         /sales/reports
  --   'delivery-reports'      /ops/delivery-reporting
  --   'scorecard-overview'    /scorecard/overview
  report_key      text NOT NULL,

  -- Frozen filter snapshot at subscribe time. Shape is report-specific
  -- and validated by src/lib/reports/registry.ts on insert.
  params          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Cadence: 'daily' | 'weekly' | 'monthly'.
  -- send_dow is ISO day-of-week (1=Mon..7=Sun); only honored for 'weekly'.
  -- send_dom is day-of-month (1..28, capped at 28 to avoid the 29-31 problem);
  --   only honored for 'monthly'.
  -- send_hour is 0..23 in the subscriber's timezone.
  cadence         text NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
  send_dow        integer CHECK (send_dow BETWEEN 1 AND 7),
  send_dom        integer CHECK (send_dom BETWEEN 1 AND 28),
  send_hour       integer NOT NULL DEFAULT 7 CHECK (send_hour BETWEEN 0 AND 23),
  timezone        text NOT NULL DEFAULT 'America/Chicago',

  -- 'pdf' | 'excel'
  format          text NOT NULL CHECK (format IN ('pdf','excel')),

  is_active       boolean NOT NULL DEFAULT true,

  -- Scheduling pointers. next_run_at is the next instant we should send;
  -- the cron sweeps WHERE is_active AND next_run_at <= now() with the index
  -- below.
  last_sent_at    timestamptz,
  next_run_at     timestamptz NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_subscriptions_due_idx
  ON bids.report_subscriptions (next_run_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS report_subscriptions_user_idx
  ON bids.report_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS report_subscriptions_report_idx
  ON bids.report_subscriptions (report_key);

-- One row per delivery attempt. Lets us debug failures + show users a
-- "last sent" history without paying the storage cost of forever.
CREATE TABLE IF NOT EXISTS bids.report_subscription_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES bids.report_subscriptions(id) ON DELETE CASCADE,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_message     text,
  resend_message_id text,
  duration_ms       integer
);

CREATE INDEX IF NOT EXISTS report_subscription_log_sub_idx
  ON bids.report_subscription_log (subscription_id, sent_at DESC);
