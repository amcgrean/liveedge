-- ============================================================
-- MIGRATION: Legacy serial-ID tables in bids schema
--
-- Apply AFTER 0003_bids_schema_migration.sql.
-- Recreates all Flask/Alembic-managed tables from Neon public schema
-- into Supabase bids schema, with identical column structure so the
-- existing Drizzle definitions in schema-legacy.ts stay valid.
--
-- Data is migrated separately via db/migrate-from-neon.ts.
-- Sequences are reset after data load to avoid PK collisions.
-- ============================================================

-- ============================================================
-- BRANCH
-- ============================================================
CREATE TABLE bids.branch (
  branch_id   SERIAL PRIMARY KEY,
  branch_name VARCHAR(255) NOT NULL,
  branch_code VARCHAR(255) NOT NULL,
  branch_type INTEGER      NOT NULL
);

-- ============================================================
-- ESTIMATOR
-- ============================================================
CREATE TABLE bids.estimator (
  "estimatorID"       SERIAL PRIMARY KEY,
  "estimatorName"     VARCHAR(100) NOT NULL,
  "estimatorUsername" VARCHAR(100) NOT NULL
);

-- ============================================================
-- DESIGNER
-- ============================================================
CREATE TABLE bids.designer (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  type     VARCHAR(50)  DEFAULT 'Designer'
);

-- ============================================================
-- USER TYPE
-- ============================================================
CREATE TABLE bids.user_type (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

-- ============================================================
-- USER (quoted — reserved keyword)
-- ============================================================
CREATE TABLE bids."user" (
  id                        SERIAL PRIMARY KEY,
  username                  VARCHAR(150) NOT NULL UNIQUE,
  email                     VARCHAR(150) NOT NULL UNIQUE,
  password                  VARCHAR(255) NOT NULL,
  usertype_id               INTEGER      NOT NULL REFERENCES bids.user_type(id),
  "estimatorID"             INTEGER REFERENCES bids.estimator("estimatorID"),
  designer_id               INTEGER REFERENCES bids.designer(id),
  user_branch_id            INTEGER REFERENCES bids.branch(branch_id),
  last_login                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),
  is_active                 BOOLEAN DEFAULT true,
  is_admin                  BOOLEAN DEFAULT false,
  is_estimator              BOOLEAN DEFAULT false,
  is_commercial_estimator   BOOLEAN DEFAULT false,
  is_residential_estimator  BOOLEAN DEFAULT false,
  is_designer               BOOLEAN DEFAULT false,
  login_count               INTEGER DEFAULT 0
);

-- ============================================================
-- USER SECURITY (permission matrix)
-- ============================================================
CREATE TABLE bids.user_security (
  user_type_id INTEGER PRIMARY KEY REFERENCES bids.user_type(id),
  admin        BOOLEAN NOT NULL,
  estimating   BOOLEAN NOT NULL,
  bid_request  BOOLEAN NOT NULL,
  design       BOOLEAN NOT NULL,
  ewp          BOOLEAN NOT NULL,
  service      BOOLEAN NOT NULL,
  install      BOOLEAN NOT NULL,
  picking      BOOLEAN NOT NULL,
  work_orders  BOOLEAN NOT NULL,
  dashboards   BOOLEAN NOT NULL,
  security_10  BOOLEAN NOT NULL,
  security_11  BOOLEAN NOT NULL,
  security_12  BOOLEAN NOT NULL,
  security_13  BOOLEAN NOT NULL,
  security_14  BOOLEAN NOT NULL,
  security_15  BOOLEAN NOT NULL,
  security_16  BOOLEAN NOT NULL,
  security_17  BOOLEAN NOT NULL,
  security_18  BOOLEAN NOT NULL,
  security_19  BOOLEAN NOT NULL,
  security_20  BOOLEAN NOT NULL
);

-- ============================================================
-- CUSTOMER (legacy flat — NOT bids.customers UUID table)
-- ============================================================
CREATE TABLE bids.customer (
  id            SERIAL PRIMARY KEY,
  "customerCode" VARCHAR(100) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  branch_id     INTEGER REFERENCES bids.branch(branch_id),
  sales_agent   VARCHAR(150)
);

-- ============================================================
-- JOB
-- ============================================================
CREATE TABLE bids.job (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER      NOT NULL REFERENCES bids.customer(id),
  job_reference VARCHAR(50),
  job_name      VARCHAR(255) NOT NULL,
  status        VARCHAR(50)  DEFAULT 'Open'
);

-- ============================================================
-- BID (legacy flat tracker — NOT bids.bids UUID table)
-- ============================================================
CREATE TABLE bids.bid (
  id               SERIAL PRIMARY KEY,
  plan_type        VARCHAR(50)  NOT NULL,
  customer_id      INTEGER      NOT NULL REFERENCES bids.customer(id),
  sales_rep_id     INTEGER REFERENCES bids."user"(id),
  project_name     VARCHAR(100) NOT NULL,
  estimator_id     INTEGER REFERENCES bids.estimator("estimatorID"),
  status           VARCHAR(50)  DEFAULT 'Incomplete',
  log_date         TIMESTAMPTZ  DEFAULT NOW(),
  due_date         TIMESTAMPTZ,
  completion_date  TIMESTAMPTZ,
  bid_date         TIMESTAMPTZ,
  flexible_bid_date BOOLEAN     DEFAULT false,
  include_specs    BOOLEAN DEFAULT false,
  include_framing  BOOLEAN DEFAULT false,
  include_siding   BOOLEAN DEFAULT false,
  include_shingle  BOOLEAN DEFAULT false,
  include_deck     BOOLEAN DEFAULT false,
  include_trim     BOOLEAN DEFAULT false,
  include_window   BOOLEAN DEFAULT false,
  include_door     BOOLEAN DEFAULT false,
  framing_notes    TEXT,
  siding_notes     TEXT,
  deck_notes       TEXT,
  trim_notes       TEXT,
  window_notes     TEXT,
  door_notes       TEXT,
  shingle_notes    TEXT,
  plan_filename    VARCHAR(255),
  email_filename   VARCHAR(255),
  notes            TEXT,
  last_updated_by  VARCHAR(150),
  last_updated_at  TIMESTAMPTZ DEFAULT NOW(),
  branch_id        INTEGER REFERENCES bids.branch(branch_id),
  job_id           INTEGER REFERENCES bids.job(id)
);

-- ============================================================
-- BID FILE
-- ============================================================
CREATE TABLE bids.bid_file (
  id          SERIAL PRIMARY KEY,
  bid_id      INTEGER      NOT NULL REFERENCES bids.bid(id),
  file_key    VARCHAR(255) NOT NULL,
  filename    VARCHAR(255) NOT NULL,
  file_type   VARCHAR(50),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BID FIELD
-- ============================================================
CREATE TABLE bids.bid_field (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  category      VARCHAR(50)  NOT NULL DEFAULT 'General',
  field_type    VARCHAR(50)  NOT NULL DEFAULT 'text',
  is_required   BOOLEAN DEFAULT false,
  options       TEXT,
  default_value VARCHAR(255),
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  branch_ids    TEXT
);

-- ============================================================
-- BID VALUE
-- ============================================================
CREATE TABLE bids.bid_value (
  id       SERIAL PRIMARY KEY,
  bid_id   INTEGER NOT NULL REFERENCES bids.bid(id),
  field_id INTEGER NOT NULL REFERENCES bids.bid_field(id),
  value    TEXT
);

-- ============================================================
-- DESIGN
-- ============================================================
CREATE TABLE bids.design (
  id                   SERIAL PRIMARY KEY,
  "planNumber"         VARCHAR(10)  NOT NULL UNIQUE,
  plan_name            VARCHAR(100) NOT NULL,
  customer_id          INTEGER      NOT NULL REFERENCES bids.customer(id),
  project_address      VARCHAR(200) NOT NULL,
  contractor           VARCHAR(100),
  log_date             TIMESTAMPTZ  DEFAULT NOW(),
  preliminary_set_date TIMESTAMPTZ,
  designer_id          INTEGER REFERENCES bids.designer(id),
  status               VARCHAR(50)  DEFAULT 'Active',
  plan_description     VARCHAR(50),
  notes                TEXT,
  last_updated_by      VARCHAR(150),
  last_updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  branch_id            INTEGER REFERENCES bids.branch(branch_id),
  square_footage       INTEGER,
  job_id               INTEGER REFERENCES bids.job(id)
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE bids.projects (
  id                 SERIAL PRIMARY KEY,
  customer_id        INTEGER REFERENCES bids.customer(id),
  sales_rep_id       INTEGER NOT NULL REFERENCES bids."user"(id),
  contractor         VARCHAR(255) NOT NULL,
  project_address    VARCHAR(255) NOT NULL,
  contractor_phone   VARCHAR(15),
  contractor_email   VARCHAR(255),
  include_framing    BOOLEAN NOT NULL DEFAULT false,
  include_siding     BOOLEAN NOT NULL DEFAULT false,
  include_shingles   BOOLEAN NOT NULL DEFAULT false,
  include_deck       BOOLEAN NOT NULL DEFAULT false,
  include_doors      BOOLEAN NOT NULL DEFAULT false,
  include_windows    BOOLEAN NOT NULL DEFAULT false,
  include_trim       BOOLEAN NOT NULL DEFAULT false,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_by    VARCHAR(150),
  last_updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  branch_id          INTEGER REFERENCES bids.branch(branch_id)
);

-- ============================================================
-- EWP
-- ============================================================
CREATE TABLE bids.ewp (
  id                SERIAL PRIMARY KEY,
  plan_number       VARCHAR(255) NOT NULL,
  sales_rep_id      INTEGER REFERENCES bids."user"(id),
  customer_id       INTEGER NOT NULL REFERENCES bids.customer(id),
  address           VARCHAR(255) NOT NULL,
  notes             TEXT,
  login_date        DATE NOT NULL,
  tji_depth         VARCHAR(255) NOT NULL,
  assigned_designer VARCHAR(255),
  layout_finalized  DATE,
  agility_quote     DATE,
  imported_stellar  DATE,
  last_updated_by   VARCHAR(150),
  last_updated_at   TIMESTAMPTZ DEFAULT NOW(),
  branch_id         INTEGER REFERENCES bids.branch(branch_id)
);

-- ============================================================
-- IT SERVICE
-- ============================================================
CREATE TABLE bids.it_service (
  id           SERIAL PRIMARY KEY,
  issue_type   VARCHAR(255) NOT NULL,
  createdby    VARCHAR(255) NOT NULL,
  description  TEXT         NOT NULL,
  status       VARCHAR(50)  NOT NULL DEFAULT 'Open',
  updatedby    VARCHAR(255),
  updated_date TIMESTAMPTZ  DEFAULT NOW(),
  notes        TEXT,
  "createdDate" TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY TRACKING
-- ============================================================
CREATE TABLE bids.login_activity (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES bids."user"(id),
  logged_in  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_out TIMESTAMPTZ
);

CREATE TABLE bids.bid_activity (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER     NOT NULL REFERENCES bids."user"(id),
  bid_id    INTEGER     NOT NULL REFERENCES bids.bid(id),
  action    VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bids.design_activity (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER     NOT NULL REFERENCES bids."user"(id),
  design_id INTEGER     NOT NULL REFERENCES bids.design(id),
  action    VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bids.general_audit (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES bids."user"(id),
  model_name VARCHAR(50) NOT NULL,
  action     VARCHAR(50) NOT NULL,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Enhanced from TEXT to JSONB for structured change tracking
  changes    JSONB
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE bids.notification_rule (
  id             SERIAL PRIMARY KEY,
  event_type     VARCHAR(50) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL,
  recipient_id   INTEGER,
  recipient_name VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  branch_id      INTEGER REFERENCES bids.branch(branch_id),
  bid_type       VARCHAR(50)
);

CREATE TABLE bids.notification_log (
  id            SERIAL PRIMARY KEY,
  bid_id        INTEGER REFERENCES bids.bid(id),
  event_type    VARCHAR(50) NOT NULL,
  recipients    TEXT,
  matched_rules TEXT,
  status        VARCHAR(50) NOT NULL,
  error_message TEXT,
  timestamp     TIMESTAMPTZ DEFAULT NOW()
);
