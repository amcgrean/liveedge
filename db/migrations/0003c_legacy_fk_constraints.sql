-- ============================================================
-- MIGRATION: Cross-table FK constraints + sequence resets
--
-- Apply AFTER data has been loaded via db/migrate-from-neon.ts.
-- Adds the FK from takeoff_sessions.legacy_bid_id → bid.id now
-- that both tables exist in the same schema, and resets all
-- serial sequences to the correct next value.
-- ============================================================

-- Now that bids.bid exists, add proper FK for legacy_bid_id
ALTER TABLE bids.takeoff_sessions
  ADD CONSTRAINT takeoff_sessions_legacy_bid_id_fkey
  FOREIGN KEY (legacy_bid_id) REFERENCES bids.bid(id) ON DELETE SET NULL;

-- ============================================================
-- Sequence resets — run AFTER data migration
-- Replace MAX values with actual post-load values, OR use the
-- setval expressions below which calculate them automatically.
-- ============================================================
SELECT setval('bids.branch_branch_id_seq',    COALESCE((SELECT MAX(branch_id) FROM bids.branch), 0) + 1, false);
SELECT setval('bids.estimator_estimatorID_seq', COALESCE((SELECT MAX("estimatorID") FROM bids.estimator), 0) + 1, false);
SELECT setval('bids.designer_id_seq',          COALESCE((SELECT MAX(id) FROM bids.designer), 0) + 1, false);
SELECT setval('bids.user_type_id_seq',         COALESCE((SELECT MAX(id) FROM bids.user_type), 0) + 1, false);
SELECT setval('bids.user_id_seq',              COALESCE((SELECT MAX(id) FROM bids."user"), 0) + 1, false);
SELECT setval('bids.customer_id_seq',          COALESCE((SELECT MAX(id) FROM bids.customer), 0) + 1, false);
SELECT setval('bids.job_id_seq',               COALESCE((SELECT MAX(id) FROM bids.job), 0) + 1, false);
SELECT setval('bids.bid_id_seq',               COALESCE((SELECT MAX(id) FROM bids.bid), 0) + 1, false);
SELECT setval('bids.bid_file_id_seq',          COALESCE((SELECT MAX(id) FROM bids.bid_file), 0) + 1, false);
SELECT setval('bids.bid_field_id_seq',         COALESCE((SELECT MAX(id) FROM bids.bid_field), 0) + 1, false);
SELECT setval('bids.bid_value_id_seq',         COALESCE((SELECT MAX(id) FROM bids.bid_value), 0) + 1, false);
SELECT setval('bids.design_id_seq',            COALESCE((SELECT MAX(id) FROM bids.design), 0) + 1, false);
SELECT setval('bids.projects_id_seq',          COALESCE((SELECT MAX(id) FROM bids.projects), 0) + 1, false);
SELECT setval('bids.ewp_id_seq',               COALESCE((SELECT MAX(id) FROM bids.ewp), 0) + 1, false);
SELECT setval('bids.it_service_id_seq',        COALESCE((SELECT MAX(id) FROM bids.it_service), 0) + 1, false);
SELECT setval('bids.login_activity_id_seq',    COALESCE((SELECT MAX(id) FROM bids.login_activity), 0) + 1, false);
SELECT setval('bids.bid_activity_id_seq',      COALESCE((SELECT MAX(id) FROM bids.bid_activity), 0) + 1, false);
SELECT setval('bids.design_activity_id_seq',   COALESCE((SELECT MAX(id) FROM bids.design_activity), 0) + 1, false);
SELECT setval('bids.general_audit_id_seq',     COALESCE((SELECT MAX(id) FROM bids.general_audit), 0) + 1, false);
SELECT setval('bids.notification_rule_id_seq', COALESCE((SELECT MAX(id) FROM bids.notification_rule), 0) + 1, false);
SELECT setval('bids.notification_log_id_seq',  COALESCE((SELECT MAX(id) FROM bids.notification_log), 0) + 1, false);
