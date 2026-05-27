import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// All beisser-takeoff tables live in the `bids` schema in Supabase,
// isolated from WH-Tracker's Alembic-managed `public` schema.
export const bidsSchema = pgSchema('bids');

// ============================================================
// USERS
// ============================================================
export const users = bidsSchema.table(
  'users',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    email:        varchar('email', { length: 255 }).notNull().unique(),
    name:         varchar('name', { length: 255 }).notNull(),
    role:         varchar('role', { length: 50 }).notNull().default('estimator'),
    // roles: 'admin', 'estimator', 'viewer'
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive:     boolean('is_active').notNull().default(true),
    // Migration bridge: integer serial ID from Flask "user" table
    legacyId:     integer('legacy_id').unique(),
    // Profile fields merged from legacy user (avoids dual user-table lookup)
    branchId:     uuid('branch_id'),   // FK added via ALTER TABLE in migration SQL
    isEstimator:             boolean('is_estimator').notNull().default(false),
    isDesigner:              boolean('is_designer').notNull().default(false),
    isCommercialEstimator:   boolean('is_commercial_estimator').notNull().default(false),
    permissions:  jsonb('permissions'),  // module flags, replaces user_security table
    lastLogin:    timestamp('last_login', { withTimezone: true }),
    loginCount:   integer('login_count').notNull().default(0),
    // Soft delete
    deletedAt:    timestamp('deleted_at', { withTimezone: true }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)]
);

// ============================================================
// BRANCHES
// ============================================================
export const branches = bidsSchema.table('branches', {
  id:        uuid('id').primaryKey().defaultRandom(),
  code:      varchar('code', { length: 50 }).notNull().unique(),
  // 'grimes', 'fort_dodge', 'coralville'
  name:      varchar('name', { length: 255 }).notNull(),
  address:   varchar('address', { length: 255 }),
  city:      varchar('city', { length: 100 }),
  state:     varchar('state', { length: 50 }),
  phone:     varchar('phone', { length: 50 }),
  settings:  jsonb('settings'),
  // { stud_sku: '...', stud_sku_9ft: '...', etc. }
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// CUSTOMERS
// ============================================================
export const customers = bidsSchema.table(
  'customers',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    code:        varchar('code', { length: 50 }).unique(),
    name:        varchar('name', { length: 255 }).notNull(),
    address:     varchar('address', { length: 255 }),
    city:        varchar('city', { length: 100 }),
    state:       varchar('state', { length: 50 }),
    zip:         varchar('zip', { length: 20 }),
    phone:       varchar('phone', { length: 50 }),
    email:       varchar('email', { length: 255 }),
    contactName: varchar('contact_name', { length: 255 }),
    notes:       text('notes'),
    isActive:    boolean('is_active').notNull().default(true),
    // Migration bridge: integer serial ID from Flask "customer" table
    legacyId:    integer('legacy_id').unique(),
    // Soft delete
    deletedAt:   timestamp('deleted_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy:   uuid('created_by').references(() => users.id),
  },
  (table) => [
    index('customers_name_idx').on(table.name),
    index('customers_code_idx').on(table.code),
  ]
);

// ============================================================
// BIDS (JSONB-based takeoff bids — NOT the legacy flat bid tracker)
// ============================================================
export const bids = bidsSchema.table(
  'bids',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    bidNumber:     varchar('bid_number', { length: 50 }).unique(),
    // auto-generated: BID-2024-0001
    jobName:       varchar('job_name', { length: 255 }).notNull(),
    customerId:    uuid('customer_id').references(() => customers.id),
    customerCode:  varchar('customer_code', { length: 50 }),
    customerName:  varchar('customer_name', { length: 255 }),
    estimatorId:   uuid('estimator_id').references(() => users.id),
    estimatorName: varchar('estimator_name', { length: 255 }).notNull(),
    branch:        varchar('branch', { length: 50 }).notNull(),
    status:        varchar('status', { length: 50 }).notNull().default('draft'),
    // statuses: 'draft', 'submitted', 'won', 'lost', 'archived'
    inputs:        jsonb('inputs').notNull(),
    // Full JobInputs object
    lineItems:     jsonb('line_items'),
    // Calculated LineItem[]
    bidSummary:    jsonb('bid_summary'),
    // { groups: {...}, options: [...], totals: {...} }
    notes:         text('notes'),
    version:       integer('version').notNull().default(1),
    // Soft delete
    deletedAt:     timestamp('deleted_at', { withTimezone: true }),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt:   timestamp('submitted_at', { withTimezone: true }),
    wonAt:         timestamp('won_at', { withTimezone: true }),
    lostAt:        timestamp('lost_at', { withTimezone: true }),
    createdBy:     uuid('created_by').references(() => users.id),
  },
  (table) => [
    index('bids_status_idx').on(table.status),
    index('bids_customer_idx').on(table.customerId),
    index('bids_estimator_idx').on(table.estimatorId),
    index('bids_created_at_idx').on(table.createdAt),
    uniqueIndex('bids_number_idx').on(table.bidNumber),
  ]
);

// ============================================================
// BID VERSIONS (change history)
// ============================================================
export const bidVersions = bidsSchema.table('bid_versions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  bidId:      uuid('bid_id')
                .notNull()
                .references(() => bids.id, { onDelete: 'cascade' }),
  version:    integer('version').notNull(),
  inputs:     jsonb('inputs').notNull(),
  lineItems:  jsonb('line_items'),
  changeNote: text('change_note'),
  changedBy:  uuid('changed_by').references(() => users.id),
  changedAt:  timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// PRODUCTS / SKUs
// ============================================================
export const products = bidsSchema.table(
  'products',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    sku:             varchar('sku', { length: 100 }).notNull().unique(),
    description:     varchar('description', { length: 500 }).notNull(),
    uom:             varchar('uom', { length: 50 }).notNull(),
    category:        varchar('category', { length: 100 }),
    // 'framing', 'siding', 'hardware', 'deck', 'roofing', 'trim'
    branchOverrides: jsonb('branch_overrides'),
    // { grimes: 'altSKU', fort_dodge: 'altSKU' }
    isActive:        boolean('is_active').notNull().default(true),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('products_category_idx').on(table.category),
    uniqueIndex('products_sku_idx').on(table.sku),
  ]
);

// ============================================================
// MULTIPLIERS / FORMULAS
// ============================================================
export const multipliers = bidsSchema.table(
  'multipliers',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    key:         varchar('key', { length: 200 }).notNull().unique(),
    // 'framing.stud_multiplier_main.value'
    value:       numeric('value', { precision: 14, scale: 8 }).notNull(),
    description: varchar('description', { length: 500 }),
    category:    varchar('category', { length: 100 }),
    // 'framing', 'sheathing', 'moisture_barrier', 'siding'
    isEditable:  boolean('is_editable').notNull().default(true),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy:   uuid('updated_by').references(() => users.id),
  },
  (table) => [
    index('multipliers_category_idx').on(table.category),
    uniqueIndex('multipliers_key_idx').on(table.key),
  ]
);

// ============================================================
// ASSEMBLIES
// ============================================================
export const assemblies = bidsSchema.table('assemblies', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category:    varchar('category', { length: 100 }),
  isActive:    boolean('is_active').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assemblyItems = bidsSchema.table(
  'assembly_items',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    assemblyId:  uuid('assembly_id')
                   .notNull()
                   .references(() => assemblies.id, { onDelete: 'cascade' }),
    productId:   uuid('product_id').references(() => products.id),
    description: varchar('description', { length: 500 }),
    qtyPerUnit:  numeric('qty_per_unit', { precision: 10, scale: 4 }).notNull(),
    unit:        varchar('unit', { length: 50 }).notNull(),
    sortOrder:   integer('sort_order').notNull().default(0),
  },
  (table) => [index('assembly_items_assembly_idx').on(table.assemblyId)]
);

// ============================================================
// TAKEOFF SESSIONS
// ============================================================
export const takeoffSessions = bidsSchema.table(
  'takeoff_sessions',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    bidId:          uuid('bid_id').references(() => bids.id),
    // legacyBidId → FK to bids.bid.id added via 0003c migration after legacy tables exist
    legacyBidId:    integer('legacy_bid_id'),
    name:           varchar('name', { length: 255 }).notNull(),
    pdfFileName:    varchar('pdf_file_name', { length: 500 }),
    pdfStorageKey:  varchar('pdf_storage_key', { length: 1000 }),
    pageCount:      integer('page_count').notNull().default(0),
    // Soft delete
    deletedAt:      timestamp('deleted_at', { withTimezone: true }),
    createdBy:      uuid('created_by').references(() => users.id),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('takeoff_sessions_bid_idx').on(table.bidId),
  ]
);

// ============================================================
// TAKEOFF VIEWPORTS
// ============================================================
export const takeoffViewports = bidsSchema.table(
  'takeoff_viewports',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    sessionId:      uuid('session_id')
                      .notNull()
                      .references(() => takeoffSessions.id, { onDelete: 'cascade' }),
    pageNumber:     integer('page_number').notNull(),
    name:           varchar('name', { length: 255 }).notNull(),
    bounds:         jsonb('bounds'), // { x, y, w, h }
    pixelsPerUnit:  numeric('pixels_per_unit', { precision: 14, scale: 6 }),
    unit:           varchar('unit', { length: 50 }).notNull().default('ft'),
    scaleName:      varchar('scale_name', { length: 100 }),
    scalePreset:    varchar('scale_preset', { length: 100 }),
  },
  (table) => [
    index('takeoff_viewports_session_idx').on(table.sessionId),
  ]
);

// ============================================================
// TAKEOFF GROUPS (Measurement Presets)
// ============================================================
export const takeoffGroups = bidsSchema.table(
  'takeoff_groups',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    sessionId:   uuid('session_id')
                   .notNull()
                   .references(() => takeoffSessions.id, { onDelete: 'cascade' }),
    name:        varchar('name', { length: 255 }).notNull(),
    color:       varchar('color', { length: 20 }).notNull().default('#22d3ee'),
    type:        varchar('type', { length: 20 }).notNull(), // 'linear' | 'area' | 'count'
    assemblyId:  uuid('assembly_id').references(() => assemblies.id),
    unit:        varchar('unit', { length: 20 }).notNull().default('LF'),
    sortOrder:   integer('sort_order').notNull().default(0),
    targetField: varchar('target_field', { length: 200 }), // 'firstFloor.ext2x6_9ft'
    isPreset:    boolean('is_preset').notNull().default(false),
    category:    varchar('category', { length: 100 }), // 'Basement', '1st Floor'
  },
  (table) => [
    index('takeoff_groups_session_idx').on(table.sessionId),
  ]
);

// ============================================================
// TAKEOFF MEASUREMENTS
// ============================================================
export const takeoffMeasurements = bidsSchema.table(
  'takeoff_measurements',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    groupId:          uuid('group_id')
                        .notNull()
                        .references(() => takeoffGroups.id, { onDelete: 'cascade' }),
    sessionId:        uuid('session_id')
                        .notNull()
                        .references(() => takeoffSessions.id, { onDelete: 'cascade' }),
    pageNumber:       integer('page_number').notNull(),
    viewportId:       uuid('viewport_id').references(() => takeoffViewports.id),
    type:             varchar('type', { length: 50 }).notNull(), // 'polyline' | 'polygon' | 'count' | 'annotation'
    geometry:         jsonb('geometry'), // Fabric.js object JSON
    calculatedValue:  numeric('calculated_value', { precision: 14, scale: 4 }),
    unit:             varchar('unit', { length: 20 }),
    label:            varchar('label', { length: 500 }),
    notes:            text('notes'),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('takeoff_measurements_group_idx').on(table.groupId),
    index('takeoff_measurements_session_idx').on(table.sessionId),
    index('takeoff_measurements_page_idx').on(table.sessionId, table.pageNumber),
  ]
);

// ============================================================
// TAKEOFF PAGE STATES (auto-save recovery)
// ============================================================
export const takeoffPageStates = bidsSchema.table(
  'takeoff_page_states',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    sessionId:   uuid('session_id')
                   .notNull()
                   .references(() => takeoffSessions.id, { onDelete: 'cascade' }),
    pageNumber:  integer('page_number').notNull(),
    fabricJson:  jsonb('fabric_json'),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('takeoff_page_states_session_page_idx').on(table.sessionId, table.pageNumber),
  ]
);

// ============================================================
// PO SUBMISSIONS (receiving check-in photos)
// ============================================================
export const poSubmissions = bidsSchema.table(
  'po_submissions',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    poNumber:       varchar('po_number', { length: 50 }).notNull(),
    imageUrls:      jsonb('image_urls').notNull().default([]),
    // R2 object keys for deletion (parallel array to imageUrls)
    imageKeys:      jsonb('image_keys').notNull().default([]),
    supplierName:   varchar('supplier_name', { length: 255 }),
    supplierKey:    varchar('supplier_key', { length: 50 }),
    // ERP po_status snapshot at submission time
    poStatus:       varchar('po_status', { length: 50 }),
    submissionType: varchar('submission_type', { length: 50 }).notNull().default('receiving_checkin'),
    priority:       varchar('priority', { length: 20 }),
    // 'high' | 'normal' | null
    notes:          text('notes'),
    // Workflow status
    status:         varchar('status', { length: 20 }).notNull().default('pending'),
    // 'pending' | 'reviewed' | 'flagged'
    // Submitter (string ID from NextAuth/app_users)
    submittedBy:    varchar('submitted_by', { length: 50 }).notNull(),
    submittedUsername: varchar('submitted_username', { length: 255 }),
    branch:         varchar('branch', { length: 20 }),
    // branch system_id e.g. '20GR'
    // Reviewer
    reviewerNotes:  text('reviewer_notes'),
    reviewedBy:     varchar('reviewed_by', { length: 50 }),
    reviewedAt:     timestamp('reviewed_at', { withTimezone: true }),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('po_submissions_po_number_idx').on(table.poNumber),
    index('po_submissions_status_idx').on(table.status),
    index('po_submissions_submitted_by_idx').on(table.submittedBy),
    index('po_submissions_branch_idx').on(table.branch),
    index('po_submissions_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================
// HUBBELL PORTAL DOCUMENTS
// ============================================================
// Replaces the previous email-shaped pipeline. PO/WO PDFs are scraped from the
// Hubbell portal locally (Playwright in C:\Users\amcgrean\python\hubbell test),
// parsed for line items + address, then POSTed to /api/admin/hubbell/upload
// which stores the PDF in R2 and writes a row here.
//
// One Hubbell doc → N Agility SOs and one Agility SO → N Hubbell docs.
// The junction is hubbell_document_sos. Initial attach comes from splitting
// agility_so_header.po_number on commas (the team types Hubbell PO/WO numbers
// into Agility's customer-PO field by hand, comma-separated).
export const hubbellDocuments = bidsSchema.table(
  'hubbell_documents',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    docType:            varchar('doc_type', { length: 10 }).notNull(),
    // 'po' | 'wo'
    docNumber:          varchar('doc_number', { length: 100 }).notNull(),
    checkNumber:        varchar('check_number', { length: 50 }),
    r2Key:              text('r2_key').notNull(),
    sourceRunId:        varchar('source_run_id', { length: 100 }).notNull(),
    sourceHash:         varchar('source_hash', { length: 64 }).notNull(),

    extractedAddress:   text('extracted_address'),
    extractedCity:      varchar('extracted_city', { length: 100 }),
    extractedState:     varchar('extracted_state', { length: 50 }),
    extractedZip:       varchar('extracted_zip', { length: 20 }),
    extractedTotal:     numeric('extracted_total', { precision: 12, scale: 2 }),
    extractedNeedBy:    date('extracted_need_by'),
    lineItems:          jsonb('line_items'),

    // Local scraper's pre-computed address match hints (from hubbell_daily_fetch.py
    // → best_job_match against the ERP shipto master). When match_ratio is ≥ 0.78
    // the upload route looks up open SOs at (scrape_cust_code, scrape_seq_num)
    // and surfaces them as address-based candidates without re-running fuzzy
    // scoring server-side.
    scrapeCustCode:     varchar('scrape_cust_code', { length: 50 }),
    scrapeSeqNum:       varchar('scrape_seq_num', { length: 50 }),
    scrapeMatchRatio:   numeric('scrape_match_ratio', { precision: 4, scale: 3 }),

    // Hubbell-portal job context: surfaced in /admin/hubbell/[id] so the
    // reviewer doesn't have to open the PDF to see which house/lot the doc
    // is for. Populated by the local scraper's metadata; all nullable.
    devCode:            varchar('dev_code', { length: 20 }),
    devName:            varchar('dev_name', { length: 120 }),
    houseNumber:        varchar('house_number', { length: 30 }),
    blockLot:           varchar('block_lot', { length: 30 }),
    modelElevation:     varchar('model_elevation', { length: 200 }),

    // Payment rollups — refreshed by /api/admin/hubbell/payments/import after
    // each batch. Source of truth is the hubbell_document_payments child table.
    paidAmountTotal:    numeric('paid_amount_total', { precision: 12, scale: 2 }),
    lastPaymentDate:    date('last_payment_date'),
    lastCheckNumber:    varchar('last_check_number', { length: 50 }),
    paymentStatus:      varchar('payment_status', { length: 20 }),
    // 'paid' | 'partial' | 'unpaid' | NULL

    // 'unmatched' | 'auto_matched' | 'confirmed' | 'rejected'
    matchStatus:        varchar('match_status', { length: 20 }).notNull().default('unmatched'),

    receivedAt:         timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hubbell_documents_source_hash_uq').on(table.sourceHash),
    index('hubbell_documents_doc_number_idx').on(table.docNumber),
    index('hubbell_documents_match_status_recv_idx').on(table.matchStatus, table.receivedAt),
    index('hubbell_documents_doc_type_idx').on(table.docType),
    index('hubbell_documents_received_at_idx').on(table.receivedAt),
  ]
);

// One row per Hubbell check ever scraped. Replaces hubbell_document_payments
// (dropped in migration 0026). Source of truth for payment facts; the
// hubbell_documents rollup columns refresh from hubbell_check_lines below.
//
// Keys: check_number UNIQUE (HUBB1xxx codes are Beisser-side AR accounts for
// work type, not separate Hubbell payer entities — all checks come from one
// vendor stream with sequential numbering). source_hash UNIQUE makes re-POSTs
// of identical data no-ops.
export const hubbellChecks = bidsSchema.table(
  'hubbell_checks',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    checkNumber:    varchar('check_number', { length: 50 }).notNull(),
    checkDate:      date('check_date'),
    totalAmount:    numeric('total_amount', { precision: 14, scale: 2 }),
    paymentCount:   integer('payment_count'),
    sourceHash:     varchar('source_hash', { length: 128 }).notNull(),
    sourceRunId:    varchar('source_run_id', { length: 100 }),
    firstSeenAt:    timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hubbell_checks_check_number_uq').on(table.checkNumber),
    uniqueIndex('hubbell_checks_source_hash_uq').on(table.sourceHash),
    index('hubbell_checks_check_date_idx').on(table.checkDate),
  ]
);

// One row per line on a Hubbell check. doc_type 'po'|'wo' joins to
// hubbell_documents on (doc_type, doc_number); doc_type 'inv' references
// agility_so_header via ref_num directly (no FK — public schema, owned by
// sync worker). payment_amount can be negative for credits.
export const hubbellCheckLines = bidsSchema.table(
  'hubbell_check_lines',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    checkId:        uuid('check_id').notNull(),    // FK → hubbell_checks.id ON DELETE CASCADE
    docType:        varchar('doc_type', { length: 10 }).notNull(),
    docNumber:      varchar('doc_number', { length: 100 }).notNull(),
    invoiceDate:    date('invoice_date'),
    paymentAmount:  numeric('payment_amount', { precision: 14, scale: 2 }).notNull(),
    grossAmount:    numeric('gross_amount', { precision: 14, scale: 2 }),
    memo:           text('memo'),
    lineSeq:        integer('line_seq').notNull(),
  },
  (table) => [
    index('hubbell_check_lines_check_id_idx').on(table.checkId),
    index('hubbell_check_lines_doc_idx').on(table.docType, table.docNumber),
  ]
);

export const hubbellDocumentSos = bidsSchema.table(
  'hubbell_document_sos',
  {
    id:                  uuid('id').primaryKey().defaultRandom(),
    documentId:          uuid('document_id').notNull(),
    // No FK to agility_so_header (lives in public schema, owned by sync worker)
    soId:                integer('so_id').notNull(),
    custCode:            varchar('cust_code', { length: 50 }),
    // 'po_number_split' | 'address' | 'manual'
    matchSource:         varchar('match_source', { length: 30 }).notNull(),
    confidence:          integer('confidence').notNull().default(0),
    matchReasons:        text('match_reasons').array().notNull().default([]),
    confirmedBy:         varchar('confirmed_by', { length: 100 }),
    confirmedAt:         timestamp('confirmed_at', { withTimezone: true }),
    // Phase-2 hook for write-back to agility_so_header.po_number via the live API.
    postedToAgilityAt:   timestamp('posted_to_agility_at', { withTimezone: true }),
    createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hubbell_document_sos_doc_so_uq').on(table.documentId, table.soId),
    index('hubbell_document_sos_so_id_idx').on(table.soId),
    index('hubbell_document_sos_document_id_idx').on(table.documentId),
    index('hubbell_document_sos_cust_code_idx').on(table.custCode),
  ]
);

// Pre-computed Hubbell-doc → Agility-SO match candidates awaiting human review.
// Populated in batch by POST /api/admin/hubbell/documents/suggest-matches; the
// /admin/hubbell/suggestions page renders pending rows for accept/reject. On
// accept, a row is copied into hubbellDocumentSos (above) and this row's
// status flips to 'accepted'.
export const hubbellDocumentSuggestions = bidsSchema.table(
  'hubbell_document_suggestions',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    documentId:     uuid('document_id').notNull(),
    soId:           integer('so_id').notNull(),
    custCode:       varchar('cust_code', { length: 50 }),
    matchSource:    varchar('match_source', { length: 30 }).notNull(),
    confidence:     integer('confidence').notNull().default(0),
    matchReasons:   text('match_reasons').array().notNull().default([]),
    // 'pending' | 'accepted' | 'rejected'
    status:         varchar('status', { length: 20 }).notNull().default('pending'),
    suggestedAt:    timestamp('suggested_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy:     varchar('reviewed_by', { length: 100 }),
    reviewedAt:     timestamp('reviewed_at', { withTimezone: true }),
    sourceRunId:    varchar('source_run_id', { length: 100 }),
  },
  (table) => [
    uniqueIndex('hubbell_document_suggestions_doc_so_uq').on(table.documentId, table.soId),
    index('hubbell_document_suggestions_status_conf_idx').on(table.status, table.confidence),
    index('hubbell_document_suggestions_doc_idx').on(table.documentId),
    index('hubbell_document_suggestions_so_idx').on(table.soId),
  ]
);

// ============================================================
// MICROSOFT GRAPH SUBSCRIPTIONS
// ============================================================
// Tracks active /subscriptions resources on the Graph side (one per shared mailbox).
// Renewed by /api/cron/graph-subscription-renew before they expire (~3-day window).
export const graphSubscriptions = bidsSchema.table(
  'graph_subscriptions',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    subscriptionId:     varchar('subscription_id', { length: 100 }).notNull().unique(),
    mailbox:            varchar('mailbox', { length: 255 }).notNull(),    // e.g. credits@beisserlumber.com
    resource:           text('resource').notNull(),                       // /users/.../messages
    clientState:        varchar('client_state', { length: 128 }).notNull(),
    expirationDateTime: timestamp('expiration_date_time', { withTimezone: true }).notNull(),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastRenewedAt:      timestamp('last_renewed_at', { withTimezone: true }),
  },
  (table) => [
    index('graph_subscriptions_mailbox_idx').on(table.mailbox),
    index('graph_subscriptions_expires_idx').on(table.expirationDateTime),
  ]
);

// ============================================================
// REPORT SUBSCRIPTIONS
// ============================================================
// User-driven email subscriptions to reports (sales, delivery, scorecard
// overview). Cron sweeps next_run_at and emails PDF or Excel attachments
// via Resend. See src/lib/reports/registry.ts for the report_key vocabulary
// and per-key params shape.
export const reportSubscriptions = bidsSchema.table(
  'report_subscriptions',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    // public.app_users.id (integer). No cross-schema FK.
    userId:       integer('user_id').notNull(),
    email:        text('email').notNull(),
    reportKey:    text('report_key').notNull(),
    params:       jsonb('params').notNull().default({}),
    cadence:      text('cadence').notNull(), // 'daily'|'weekly'|'monthly'
    sendDow:      integer('send_dow'),       // 1..7 (weekly)
    sendDom:      integer('send_dom'),       // 1..28 (monthly)
    sendHour:     integer('send_hour').notNull().default(7),
    timezone:     text('timezone').notNull().default('America/Chicago'),
    format:       text('format').notNull(),  // 'pdf'|'excel'
    isActive:     boolean('is_active').notNull().default(true),
    lastSentAt:   timestamp('last_sent_at',  { withTimezone: true }),
    nextRunAt:    timestamp('next_run_at',   { withTimezone: true }).notNull(),
    createdAt:    timestamp('created_at',    { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at',    { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('report_subscriptions_due_idx').on(table.nextRunAt),
    index('report_subscriptions_user_idx').on(table.userId),
    index('report_subscriptions_report_idx').on(table.reportKey),
  ]
);

export const reportSubscriptionLog = bidsSchema.table(
  'report_subscription_log',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    subscriptionId:   uuid('subscription_id').notNull()
      .references(() => reportSubscriptions.id, { onDelete: 'cascade' }),
    sentAt:           timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    status:           text('status').notNull(), // 'sent'|'failed'|'skipped'
    errorMessage:     text('error_message'),
    resendMessageId:  text('resend_message_id'),
    durationMs:       integer('duration_ms'),
  },
  (table) => [
    index('report_subscription_log_sub_idx').on(table.subscriptionId, table.sentAt),
  ]
);

// ============================================================
// ITEM PLANNING (replenishment policy overrides)
// ============================================================
// LiveEdge-managed planning overrides that power the rebuilt
// /purchasing/suggested-buys and /purchasing/outages views. The engine
// reads these on top of Agility's stock/demand/supply data — Agility's
// own min/max/safety-stock fields are not reliable for Beisser's mix
// (especially Millwork), so LiveEdge owns the policy here.
// See docs/buyers-workspace-plan-2026-05-22.md.
export const branchPlanningDefaults = bidsSchema.table('branch_planning_defaults', {
  systemId:           text('system_id').primaryKey(),
  usageWindowDays:    integer('usage_window_days').notNull().default(90),
  safetyStockDays:    integer('safety_stock_days').notNull().default(7),
  // Optional 12-element jsonb array of monthly multipliers.
  seasonalityProfile: jsonb('seasonality_profile'),
  updatedBy:          text('updated_by'),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itemPlanning = bidsSchema.table(
  'item_planning',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    systemId:           text('system_id').notNull(),
    itemCode:           text('item_code').notNull(),

    // Reorder policy — all nullable so a row can carry just one override.
    minOnHand:          numeric('min_on_hand'),
    targetOnHand:       numeric('target_on_hand'),
    safetyStockDays:    integer('safety_stock_days'),
    usageWindowDays:    integer('usage_window_days'),

    // Seasonality — constant factor and/or 12-month profile.
    seasonalityFactor:  numeric('seasonality_factor'),
    seasonalityProfile: jsonb('seasonality_profile'),

    packQty:            numeric('pack_qty'),
    preferredSupplier:  text('preferred_supplier'),

    isCritical:         boolean('is_critical').notNull().default(false),
    category:           text('category'),
    isPaused:           boolean('is_paused').notNull().default(false),

    notes:              text('notes'),
    // 'manual' | 'csv_import' | 'admin_suggestion'
    source:             text('source').notNull().default('manual'),
    updatedBy:          text('updated_by'),
    updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('item_planning_system_item_idx').on(table.systemId, table.itemCode),
    index('item_planning_category_idx').on(table.systemId, table.category),
    index('item_planning_critical_idx').on(table.systemId),
    index('item_planning_paused_idx').on(table.systemId),
  ],
);

// Buyer-written notes against items on the Recent Movement tile of
// /purchasing/workspace. One row per (system_id, item_code, week_starting)
// where week_starting is the Monday of the ISO week — lets a buyer keep
// distinct context week to week without overwriting.
export const movementNotes = bidsSchema.table(
  'movement_notes',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    systemId:      text('system_id').notNull(),
    itemCode:      text('item_code').notNull(),
    weekStarting:  date('week_starting').notNull(),
    note:          text('note').notNull(),
    dir:           text('dir'),                    // 'up' | 'down' | null
    createdBy:     text('created_by'),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('movement_notes_unique_idx').on(table.systemId, table.itemCode, table.weekStarting),
    index('movement_notes_item_idx').on(table.systemId, table.itemCode, table.weekStarting),
  ],
);

// ============================================================
// DISPATCH ROUTE-COMPLETION ALERTS
// ============================================================
// Configurable recipients per branch + send log for the alert that fires
// when a driver finishes the final stop on a dispatch route. Hook lives in
// app/api/dispatch/orders/[so_number]/deliver/route.ts; orchestrator in
// src/lib/dispatch/route-completion.ts. See migration 0033.
export const dispatchAlertRecipients = bidsSchema.table(
  'dispatch_alert_recipients',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    // Matches public.dispatch_routes.branch_code: '10FD'|'20GR'|'25BW'|'40CV'.
    branchCode:    text('branch_code').notNull(),
    name:          text('name').notNull(),
    email:         text('email'),
    // E.164 e.g. '+15155550123'.
    phoneE164:     text('phone_e164'),
    notifyEmail:   boolean('notify_email').notNull().default(true),
    notifySms:     boolean('notify_sms').notNull().default(false),
    isActive:      boolean('is_active').notNull().default(true),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dispatch_alert_recipients_branch_idx').on(table.branchCode, table.isActive),
  ],
);

export const dispatchRouteCompletionLog = bidsSchema.table(
  'dispatch_route_completion_log',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    // public.dispatch_routes.id (integer). No cross-schema FK.
    routeId:            integer('route_id').notNull(),
    branchCode:         text('branch_code').notNull(),
    driverName:         text('driver_name'),
    routeName:          text('route_name'),
    completedSoNumber:  text('completed_so_number'),
    completedAt:        timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
    recipientId:        uuid('recipient_id').references(() => dispatchAlertRecipients.id, { onDelete: 'set null' }),
    recipientLabel:     text('recipient_label'),
    channel:            text('channel').notNull(),      // 'email' | 'sms'
    status:             text('status').notNull(),       // 'sent' | 'failed' | 'skipped_console'
    error:              text('error'),
    providerMessageId:  text('provider_message_id'),
    sentAt:             timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dispatch_route_completion_log_recent_idx').on(table.sentAt),
    index('dispatch_route_completion_log_route_idx').on(table.routeId, table.channel, table.status),
  ],
);

// ============================================================
// RELATIONS
// ============================================================
export const bidsRelations = relations(bids, ({ one, many }) => ({
  customer: one(customers, {
    fields: [bids.customerId],
    references: [customers.id],
  }),
  estimator: one(users, {
    fields: [bids.estimatorId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [bids.createdBy],
    references: [users.id],
  }),
  versions: many(bidVersions),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  bids: many(bids),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, {
    fields: [users.branchId],
    references: [branches.id],
  }),
  bids: many(bids),
  bidVersionsChanged: many(bidVersions),
}));

export const assembliesRelations = relations(assemblies, ({ many }) => ({
  items: many(assemblyItems),
  takeoffGroups: many(takeoffGroups),
}));

export const assemblyItemsRelations = relations(assemblyItems, ({ one }) => ({
  assembly: one(assemblies, {
    fields: [assemblyItems.assemblyId],
    references: [assemblies.id],
  }),
  product: one(products, {
    fields: [assemblyItems.productId],
    references: [products.id],
  }),
}));

export const takeoffSessionsRelations = relations(takeoffSessions, ({ one, many }) => ({
  bid: one(bids, {
    fields: [takeoffSessions.bidId],
    references: [bids.id],
  }),
  createdByUser: one(users, {
    fields: [takeoffSessions.createdBy],
    references: [users.id],
  }),
  viewports: many(takeoffViewports),
  groups: many(takeoffGroups),
  measurements: many(takeoffMeasurements),
  pageStates: many(takeoffPageStates),
}));

export const takeoffViewportsRelations = relations(takeoffViewports, ({ one }) => ({
  session: one(takeoffSessions, {
    fields: [takeoffViewports.sessionId],
    references: [takeoffSessions.id],
  }),
}));

export const takeoffGroupsRelations = relations(takeoffGroups, ({ one, many }) => ({
  session: one(takeoffSessions, {
    fields: [takeoffGroups.sessionId],
    references: [takeoffSessions.id],
  }),
  assembly: one(assemblies, {
    fields: [takeoffGroups.assemblyId],
    references: [assemblies.id],
  }),
  measurements: many(takeoffMeasurements),
}));

export const takeoffMeasurementsRelations = relations(takeoffMeasurements, ({ one }) => ({
  group: one(takeoffGroups, {
    fields: [takeoffMeasurements.groupId],
    references: [takeoffGroups.id],
  }),
  session: one(takeoffSessions, {
    fields: [takeoffMeasurements.sessionId],
    references: [takeoffSessions.id],
  }),
  viewport: one(takeoffViewports, {
    fields: [takeoffMeasurements.viewportId],
    references: [takeoffViewports.id],
  }),
}));

export const takeoffPageStatesRelations = relations(takeoffPageStates, ({ one }) => ({
  session: one(takeoffSessions, {
    fields: [takeoffPageStates.sessionId],
    references: [takeoffSessions.id],
  }),
}));

// ============================================================
// TYPE EXPORTS
// ============================================================
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Bid = typeof bids.$inferSelect;
export type NewBid = typeof bids.$inferInsert;
export type BidVersion = typeof bidVersions.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Multiplier = typeof multipliers.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Assembly = typeof assemblies.$inferSelect;
export type NewAssembly = typeof assemblies.$inferInsert;
export type AssemblyItem = typeof assemblyItems.$inferSelect;
export type TakeoffSession = typeof takeoffSessions.$inferSelect;
export type NewTakeoffSession = typeof takeoffSessions.$inferInsert;
export type TakeoffViewport = typeof takeoffViewports.$inferSelect;
export type TakeoffGroup = typeof takeoffGroups.$inferSelect;
export type TakeoffMeasurement = typeof takeoffMeasurements.$inferSelect;
export type TakeoffPageState = typeof takeoffPageStates.$inferSelect;
export type PoSubmission = typeof poSubmissions.$inferSelect;
export type NewPoSubmission = typeof poSubmissions.$inferInsert;
export type GraphSubscription = typeof graphSubscriptions.$inferSelect;
export type NewGraphSubscription = typeof graphSubscriptions.$inferInsert;
export type ReportSubscription = typeof reportSubscriptions.$inferSelect;
export type NewReportSubscription = typeof reportSubscriptions.$inferInsert;
export type ReportSubscriptionLog = typeof reportSubscriptionLog.$inferSelect;
export type BranchPlanningDefaults = typeof branchPlanningDefaults.$inferSelect;
export type NewBranchPlanningDefaults = typeof branchPlanningDefaults.$inferInsert;
export type ItemPlanning = typeof itemPlanning.$inferSelect;
export type NewItemPlanning = typeof itemPlanning.$inferInsert;
export type MovementNote = typeof movementNotes.$inferSelect;
export type NewMovementNote = typeof movementNotes.$inferInsert;
export type DispatchAlertRecipient = typeof dispatchAlertRecipients.$inferSelect;
export type NewDispatchAlertRecipient = typeof dispatchAlertRecipients.$inferInsert;
export type DispatchRouteCompletionLog = typeof dispatchRouteCompletionLog.$inferSelect;
export type NewDispatchRouteCompletionLog = typeof dispatchRouteCompletionLog.$inferInsert;
