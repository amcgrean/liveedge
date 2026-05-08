-- Microsoft Graph change-notification subscriptions.
-- One row per active subscription (currently: credits@ and hubbell@ shared mailboxes).
-- Subscriptions expire ~3 days from creation; renewed nightly by the
-- graph-subscription-renew cron.

CREATE TABLE IF NOT EXISTS bids.graph_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      varchar(100) NOT NULL UNIQUE,
  mailbox              varchar(255) NOT NULL,
  resource             text         NOT NULL,
  client_state         varchar(128) NOT NULL,
  expiration_date_time timestamptz  NOT NULL,
  created_at           timestamptz  NOT NULL DEFAULT NOW(),
  last_renewed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS graph_subscriptions_mailbox_idx
  ON bids.graph_subscriptions (mailbox);

CREATE INDEX IF NOT EXISTS graph_subscriptions_expires_idx
  ON bids.graph_subscriptions (expiration_date_time);
