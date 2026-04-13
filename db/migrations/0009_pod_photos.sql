-- Migration 0009: POD Photos
-- Stores delivery (and future load/pick/refusal) photos uploaded via
-- the LiveEdge driver POD page. Photos are stored in R2; this table
-- holds the metadata so the Agility Images URL viewer can retrieve them.
--
-- Apply manually in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS bids.pod_photos (
  id           SERIAL PRIMARY KEY,
  so_id        VARCHAR(30)  NOT NULL,   -- RefNum from Agility (e.g. "0001472105")
  branch_code  VARCHAR(10)  NOT NULL,   -- Branch from Agility (e.g. "20GR")
  shipment_num INTEGER      NOT NULL DEFAULT 1,
  agility_guid VARCHAR(150),            -- GUID param Agility passes to the viewer
  r2_key       TEXT         NOT NULL,
  filename     TEXT         NOT NULL,
  content_type TEXT         NOT NULL DEFAULT 'image/jpeg',
  file_size    INTEGER,
  category     TEXT         NOT NULL DEFAULT 'delivery',
                                        -- delivery | load | pick | refusal
  driver_name  TEXT,
  notes        TEXT,
  taken_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pod_photos_so_branch_idx
  ON bids.pod_photos (so_id, branch_code);

CREATE INDEX IF NOT EXISTS pod_photos_agility_guid_idx
  ON bids.pod_photos (agility_guid)
  WHERE agility_guid IS NOT NULL;

CREATE INDEX IF NOT EXISTS pod_photos_taken_at_idx
  ON bids.pod_photos (taken_at DESC);
