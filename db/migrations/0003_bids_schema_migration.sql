-- ============================================================
-- MIGRATION: Create bids schema in Supabase
--
-- Apply this in the Supabase SQL editor (agility-api project).
-- This creates all beisser-takeoff tables in the `bids` schema,
-- isolated from WH-Tracker's Alembic-managed `public` schema.
--
-- Includes all enhancements agreed during migration planning:
--   - legacy_id bridge columns on users + customers
--   - User profile fields merged from legacy Flask user table
--   - deleted_at soft-delete on users, customers, bids, takeoff_sessions
--   - Full-text search GIN indexes on bids.job_name + customers.name
--   - Proper FK from takeoff_sessions.legacy_bid_id to bid.id
--
-- Run order:
--   1. This file (new UUID-based tables)
--   2. 0003b_legacy_tables_migration.sql (legacy serial-ID tables)
--   3. 0003c_legacy_fk_constraints.sql   (cross-table FKs after both exist)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS bids;

COMMENT ON SCHEMA bids IS
  'Beisser Takeoff app — UUID new tables + migrated legacy tables. Drizzle-managed.';

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE bids.users (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     VARCHAR(255) NOT NULL UNIQUE,
  name                      VARCHAR(255) NOT NULL,
  role                      VARCHAR(50)  NOT NULL DEFAULT 'estimator',
  -- roles: 'admin', 'estimator', 'viewer'
  password_hash             VARCHAR(255) NOT NULL,
  is_active                 BOOLEAN      NOT NULL DEFAULT true,
  -- Migration bridge: integer serial ID from Flask "user" table
  legacy_id                 INTEGER      UNIQUE,
  -- Profile fields merged from legacy user (avoids dual user-table lookup)
  branch_id                 UUID,        -- FK added after branches table
  is_estimator              BOOLEAN      NOT NULL DEFAULT false,
  is_designer               BOOLEAN      NOT NULL DEFAULT false,
  is_commercial_estimator   BOOLEAN      NOT NULL DEFAULT false,
  permissions               JSONB,       -- module flags, replaces user_security table
  last_login                TIMESTAMPTZ,
  login_count               INTEGER      NOT NULL DEFAULT 0,
  -- Soft delete
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_email_idx    ON bids.users (email);
CREATE INDEX        users_legacy_id_idx ON bids.users (legacy_id);

-- ============================================================
-- BRANCHES
-- ============================================================
CREATE TABLE bids.branches (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code       VARCHAR(50)  NOT NULL UNIQUE,
  -- 'grimes', 'fort_dodge', 'coralville'
  name       VARCHAR(255) NOT NULL,
  address    VARCHAR(255),
  city       VARCHAR(100),
  state      VARCHAR(50),
  phone      VARCHAR(50),
  settings   JSONB,
  -- { stud_sku: '...', stud_sku_9ft: '...', etc. }
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Now that branches exists, add the FK on users
ALTER TABLE bids.users
  ADD CONSTRAINT users_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES bids.branches(id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE bids.customers (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(50)  UNIQUE,
  name         VARCHAR(255) NOT NULL,
  address      VARCHAR(255),
  city         VARCHAR(100),
  state        VARCHAR(50),
  zip          VARCHAR(20),
  phone        VARCHAR(50),
  email        VARCHAR(255),
  contact_name VARCHAR(255),
  notes        TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  -- Migration bridge: integer serial ID from Flask "customer" table
  legacy_id    INTEGER      UNIQUE,
  -- Soft delete
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES bids.users(id)
);
CREATE INDEX customers_name_idx      ON bids.customers (name);
CREATE INDEX customers_code_idx      ON bids.customers (code);
CREATE INDEX customers_legacy_id_idx ON bids.customers (legacy_id);
-- Full-text search
CREATE INDEX customers_name_fts ON bids.customers
  USING gin(to_tsvector('english', name));

-- ============================================================
-- BIDS (JSONB-based takeoff bids — NOT the legacy flat bid tracker)
-- ============================================================
CREATE TABLE bids.bids (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_number     VARCHAR(50)  UNIQUE,
  -- auto-generated: BID-2024-0001
  job_name       VARCHAR(255) NOT NULL,
  customer_id    UUID REFERENCES bids.customers(id),
  customer_code  VARCHAR(50),
  customer_name  VARCHAR(255),
  estimator_id   UUID REFERENCES bids.users(id),
  estimator_name VARCHAR(255) NOT NULL,
  branch         VARCHAR(50)  NOT NULL,
  status         VARCHAR(50)  NOT NULL DEFAULT 'draft',
  -- statuses: 'draft', 'submitted', 'won', 'lost', 'archived'
  inputs         JSONB        NOT NULL,
  -- Full JobInputs object
  line_items     JSONB,
  -- Calculated LineItem[]
  bid_summary    JSONB,
  -- { groups: {...}, options: [...], totals: {...} }
  notes          TEXT,
  version        INTEGER      NOT NULL DEFAULT 1,
  -- Soft delete
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ,
  won_at         TIMESTAMPTZ,
  lost_at        TIMESTAMPTZ,
  created_by     UUID REFERENCES bids.users(id)
);
CREATE INDEX        bids_status_idx     ON bids.bids (status);
CREATE INDEX        bids_customer_idx   ON bids.bids (customer_id);
CREATE INDEX        bids_estimator_idx  ON bids.bids (estimator_id);
CREATE INDEX        bids_created_at_idx ON bids.bids (created_at);
CREATE UNIQUE INDEX bids_number_idx     ON bids.bids (bid_number);
-- Full-text search
CREATE INDEX bids_job_name_fts ON bids.bids
  USING gin(to_tsvector('english', job_name));

-- ============================================================
-- BID VERSIONS
-- ============================================================
CREATE TABLE bids.bid_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id      UUID        NOT NULL REFERENCES bids.bids(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  inputs      JSONB       NOT NULL,
  line_items  JSONB,
  change_note TEXT,
  changed_by  UUID REFERENCES bids.users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX bid_versions_bid_idx ON bids.bid_versions (bid_id);

-- ============================================================
-- PRODUCTS / SKUs
-- ============================================================
CREATE TABLE bids.products (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  sku              VARCHAR(100) NOT NULL UNIQUE,
  description      VARCHAR(500) NOT NULL,
  uom              VARCHAR(50)  NOT NULL,
  category         VARCHAR(100),
  -- 'framing', 'siding', 'hardware', 'deck', 'roofing', 'trim'
  branch_overrides JSONB,
  -- { grimes: 'altSKU', fort_dodge: 'altSKU' }
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX        products_category_idx ON bids.products (category);
CREATE UNIQUE INDEX products_sku_idx      ON bids.products (sku);

-- ============================================================
-- MULTIPLIERS / FORMULAS
-- ============================================================
CREATE TABLE bids.multipliers (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(200)   NOT NULL UNIQUE,
  -- 'framing.stud_multiplier_main.value'
  value       NUMERIC(14, 8) NOT NULL,
  description VARCHAR(500),
  category    VARCHAR(100),
  -- 'framing', 'sheathing', 'moisture_barrier', 'siding'
  is_editable BOOLEAN        NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES bids.users(id)
);
CREATE INDEX        multipliers_category_idx ON bids.multipliers (category);
CREATE UNIQUE INDEX multipliers_key_idx      ON bids.multipliers (key);

-- ============================================================
-- ASSEMBLIES
-- ============================================================
CREATE TABLE bids.assemblies (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE bids.assembly_items (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id  UUID           NOT NULL REFERENCES bids.assemblies(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES bids.products(id),
  description  VARCHAR(500),
  qty_per_unit NUMERIC(10, 4) NOT NULL,
  unit         VARCHAR(50)    NOT NULL,
  sort_order   INTEGER        NOT NULL DEFAULT 0
);
CREATE INDEX assembly_items_assembly_idx ON bids.assembly_items (assembly_id);

-- ============================================================
-- TAKEOFF SESSIONS
-- ============================================================
CREATE TABLE bids.takeoff_sessions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id          UUID REFERENCES bids.bids(id),
  -- legacy_bid_id links to the legacy bid tracker (bids.bid.id after legacy tables created)
  legacy_bid_id   INTEGER,
  name            VARCHAR(255) NOT NULL,
  pdf_file_name   VARCHAR(500),
  pdf_storage_key VARCHAR(1000),
  page_count      INTEGER      NOT NULL DEFAULT 0,
  -- Soft delete
  deleted_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES bids.users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX takeoff_sessions_bid_idx        ON bids.takeoff_sessions (bid_id);
CREATE INDEX takeoff_sessions_legacy_bid_idx ON bids.takeoff_sessions (legacy_bid_id);

-- ============================================================
-- TAKEOFF VIEWPORTS
-- ============================================================
CREATE TABLE bids.takeoff_viewports (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID           NOT NULL REFERENCES bids.takeoff_sessions(id) ON DELETE CASCADE,
  page_number     INTEGER        NOT NULL,
  name            VARCHAR(255)   NOT NULL,
  bounds          JSONB,
  -- { x, y, w, h }
  pixels_per_unit NUMERIC(14, 6),
  unit            VARCHAR(50)    NOT NULL DEFAULT 'ft',
  scale_name      VARCHAR(100),
  scale_preset    VARCHAR(100)
);
CREATE INDEX takeoff_viewports_session_idx ON bids.takeoff_viewports (session_id);

-- ============================================================
-- TAKEOFF GROUPS
-- ============================================================
CREATE TABLE bids.takeoff_groups (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID         NOT NULL REFERENCES bids.takeoff_sessions(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  color        VARCHAR(20)  NOT NULL DEFAULT '#22d3ee',
  type         VARCHAR(20)  NOT NULL,
  -- 'linear' | 'area' | 'count'
  assembly_id  UUID REFERENCES bids.assemblies(id),
  unit         VARCHAR(20)  NOT NULL DEFAULT 'LF',
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  target_field VARCHAR(200),
  -- 'firstFloor.ext2x6_9ft'
  is_preset    BOOLEAN      NOT NULL DEFAULT false,
  category     VARCHAR(100)
  -- 'Basement', '1st Floor'
);
CREATE INDEX takeoff_groups_session_idx ON bids.takeoff_groups (session_id);

-- ============================================================
-- TAKEOFF MEASUREMENTS
-- ============================================================
CREATE TABLE bids.takeoff_measurements (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID           NOT NULL REFERENCES bids.takeoff_groups(id) ON DELETE CASCADE,
  session_id       UUID           NOT NULL REFERENCES bids.takeoff_sessions(id) ON DELETE CASCADE,
  page_number      INTEGER        NOT NULL,
  viewport_id      UUID REFERENCES bids.takeoff_viewports(id),
  type             VARCHAR(50)    NOT NULL,
  -- 'polyline' | 'polygon' | 'count' | 'annotation'
  geometry         JSONB,
  -- Fabric.js object JSON
  calculated_value NUMERIC(14, 4),
  unit             VARCHAR(20),
  label            VARCHAR(500),
  notes            TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX takeoff_measurements_group_idx   ON bids.takeoff_measurements (group_id);
CREATE INDEX takeoff_measurements_session_idx ON bids.takeoff_measurements (session_id);
CREATE INDEX takeoff_measurements_page_idx    ON bids.takeoff_measurements (session_id, page_number);

-- ============================================================
-- TAKEOFF PAGE STATES (auto-save / recovery)
-- ============================================================
CREATE TABLE bids.takeoff_page_states (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES bids.takeoff_sessions(id) ON DELETE CASCADE,
  page_number INTEGER     NOT NULL,
  fabric_json JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX takeoff_page_states_session_page_idx
  ON bids.takeoff_page_states (session_id, page_number);
