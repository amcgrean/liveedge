-- 0033_dispatch_route_completion_alerts.sql
-- Real-time alert when a driver finishes their final assigned stop on a
-- dispatch route. Recipients are configurable per branch (email and/or SMS)
-- so each yard can route the alert to whoever actually preps loads there,
-- which may not be a dispatch.manage user (could be a yard lead, a shared
-- phone the dispatcher carries, a shared inbox, etc.).
--
-- Hook point: app/api/dispatch/orders/[so_number]/deliver/route.ts fires
-- src/lib/dispatch/route-completion.ts after flipping
-- public.dispatch_route_stops.status to 'delivered' | 'skipped'. If the
-- count of remaining open stops on that route_id is zero, this orchestrator
-- runs and writes one row per (route_id, recipient_id, channel) into the
-- log table below.
--
-- Apply manually in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS bids.dispatch_alert_recipients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches public.dispatch_routes.branch_code: '10FD'|'20GR'|'25BW'|'40CV'.
  branch_code    text NOT NULL,
  name           text NOT NULL,
  email          text,
  -- E.164 format, e.g. '+15155550123'.
  phone_e164     text,
  notify_email   boolean NOT NULL DEFAULT true,
  notify_sms     boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- A recipient must have at least one usable channel.
  CHECK (
    (notify_email = false OR email IS NOT NULL) AND
    (notify_sms   = false OR phone_e164 IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS dispatch_alert_recipients_branch_idx
  ON bids.dispatch_alert_recipients (branch_code, is_active);

-- One row per (route, recipient, channel) send attempt. The orchestrator
-- pre-checks for an existing terminal-status row (sent / skipped_console)
-- before invoking the provider, so retries on a previously-failed send
-- append a fresh row instead of overwriting the audit trail.
CREATE TABLE IF NOT EXISTS bids.dispatch_route_completion_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- public.dispatch_routes.id (integer). No cross-schema FK.
  route_id            integer NOT NULL,
  branch_code         text NOT NULL,
  driver_name         text,
  route_name          text,
  completed_so_number text,
  completed_at        timestamptz NOT NULL DEFAULT now(),
  recipient_id        uuid REFERENCES bids.dispatch_alert_recipients(id) ON DELETE SET NULL,
  recipient_label     text,
  channel             text NOT NULL CHECK (channel IN ('email','sms')),
  status              text NOT NULL CHECK (status IN ('sent','failed','skipped_console')),
  error               text,
  provider_message_id text,
  sent_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatch_route_completion_log_recent_idx
  ON bids.dispatch_route_completion_log (sent_at DESC);

CREATE INDEX IF NOT EXISTS dispatch_route_completion_log_route_idx
  ON bids.dispatch_route_completion_log (route_id, channel, status);
