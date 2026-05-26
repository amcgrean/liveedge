-- 0030_movement_notes.sql
-- Buyer-written notes against items showing notable velocity change in
-- the Recent Movement tile on /purchasing/workspace.
--
-- One row per (system_id, item_code, week_starting). week_starting is
-- the Monday of the ISO week the note belongs to so a single item can
-- have one note per week without overwriting last week's context.
--
-- Apply manually in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS bids.movement_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id      text NOT NULL,
  item_code      text NOT NULL,
  -- Monday of the ISO week (UTC). Caller is expected to normalize.
  week_starting  date NOT NULL,
  -- Free-form annotation: "Spring framing rush", "Hagen multi-fam Bldg C", etc.
  note           text NOT NULL,
  -- 'up' | 'down' | null — when set, the note is contextual to a
  -- specific direction (lets the engine show the right note even if
  -- velocity flips week to week).
  dir            text CHECK (dir IN ('up','down') OR dir IS NULL),
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (system_id, item_code, week_starting)
);

CREATE INDEX IF NOT EXISTS movement_notes_item_idx
  ON bids.movement_notes (system_id, item_code, week_starting DESC);
