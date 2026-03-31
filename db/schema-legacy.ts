/**
 * Drizzle schema definitions for LEGACY tables created by the Flask estimating-app.
 *
 * These tables already exist in the Neon Postgres database (managed by Alembic).
 * DO NOT run drizzle-kit push/generate against these — they are read/write
 * definitions only, used for type-safe queries from Next.js.
 *
 * All primary keys are serial integers (not UUIDs).
 * Column names match the Flask/SQLAlchemy models exactly.
 */
import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  date,
} from 'drizzle-orm/pg-core';

// ============================================================
// BRANCH
// ============================================================
export const legacyBranch = pgTable('branch', {
  branchId: serial('branch_id').primaryKey(),
  branchName: varchar('branch_name', { length: 255 }).notNull(),
  branchCode: varchar('branch_code', { length: 255 }).notNull(),
  branchType: integer('branch_type').notNull(),
});

// ============================================================
// ESTIMATOR
// ============================================================
export const legacyEstimator = pgTable('estimator', {
  estimatorID: serial('estimatorID').primaryKey(),
  estimatorName: varchar('estimatorName', { length: 100 }).notNull(),
  estimatorUsername: varchar('estimatorUsername', { length: 100 }).notNull(),
});

// ============================================================
// DESIGNER
// ============================================================
export const legacyDesigner = pgTable('designer', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  username: varchar('username', { length: 100 }).notNull(),
  type: varchar('type', { length: 50 }).default('Designer'),
});

// ============================================================
// USER TYPE
// ============================================================
export const legacyUserType = pgTable('user_type', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
});

// ============================================================
// USER (legacy "user" table — lowercase, quoted)
// ============================================================
export const legacyUser = pgTable('user', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 150 }).notNull().unique(),
  email: varchar('email', { length: 150 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  usertypeId: integer('usertype_id')
    .notNull()
    .references(() => legacyUserType.id),
  estimatorID: integer('estimatorID').references(
    () => legacyEstimator.estimatorID
  ),
  designerId: integer('designer_id').references(() => legacyDesigner.id),
  userBranchId: integer('user_branch_id').references(
    () => legacyBranch.branchId
  ),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  isActive: boolean('is_active').default(true),
  isAdmin: boolean('is_admin').default(false),
  isEstimator: boolean('is_estimator').default(false),
  isCommercialEstimator: boolean('is_commercial_estimator').default(false),
  isResidentialEstimator: boolean('is_residential_estimator').default(false),
  isDesigner: boolean('is_designer').default(false),
  loginCount: integer('login_count').default(0),
});

// ============================================================
// USER SECURITY (permission matrix — PK is user_type_id)
// ============================================================
export const legacyUserSecurity = pgTable('user_security', {
  userTypeId: integer('user_type_id')
    .primaryKey()
    .references(() => legacyUserType.id),
  admin: boolean('admin').notNull(),
  estimating: boolean('estimating').notNull(),
  bidRequest: boolean('bid_request').notNull(),
  design: boolean('design').notNull(),
  ewp: boolean('ewp').notNull(),
  service: boolean('service').notNull(),
  install: boolean('install').notNull(),
  picking: boolean('picking').notNull(),
  workOrders: boolean('work_orders').notNull(),
  dashboards: boolean('dashboards').notNull(),
  security10: boolean('security_10').notNull(),
  security11: boolean('security_11').notNull(),
  security12: boolean('security_12').notNull(),
  security13: boolean('security_13').notNull(),
  security14: boolean('security_14').notNull(),
  security15: boolean('security_15').notNull(),
  security16: boolean('security_16').notNull(),
  security17: boolean('security_17').notNull(),
  security18: boolean('security_18').notNull(),
  security19: boolean('security_19').notNull(),
  security20: boolean('security_20').notNull(),
});

// ============================================================
// CUSTOMER
// ============================================================
export const legacyCustomer = pgTable('customer', {
  id: serial('id').primaryKey(),
  customerCode: varchar('customerCode', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  branchId: integer('branch_id').references(() => legacyBranch.branchId),
  salesAgent: varchar('sales_agent', { length: 150 }),
});

// ============================================================
// JOB
// ============================================================
export const legacyJob = pgTable('job', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => legacyCustomer.id),
  jobReference: varchar('job_reference', { length: 50 }),
  jobName: varchar('job_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('Open'),
});

// ============================================================
// BID (legacy flat bid tracker — NOT the JSONB-based "bids" table)
// ============================================================
export const legacyBid = pgTable('bid', {
  id: serial('id').primaryKey(),
  planType: varchar('plan_type', { length: 50 }).notNull(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => legacyCustomer.id),
  salesRepId: integer('sales_rep_id').references(() => legacyUser.id),
  projectName: varchar('project_name', { length: 100 }).notNull(),
  estimatorId: integer('estimator_id').references(
    () => legacyEstimator.estimatorID
  ),
  status: varchar('status', { length: 50 }).default('Incomplete'),
  logDate: timestamp('log_date').defaultNow(),
  dueDate: timestamp('due_date'),
  completionDate: timestamp('completion_date'),
  bidDate: timestamp('bid_date'),
  flexibleBidDate: boolean('flexible_bid_date').default(false),
  // Spec include flags
  includeSpecs: boolean('include_specs').default(false),
  includeFraming: boolean('include_framing').default(false),
  includeSiding: boolean('include_siding').default(false),
  includeShingle: boolean('include_shingle').default(false),
  includeDeck: boolean('include_deck').default(false),
  includeTrim: boolean('include_trim').default(false),
  includeWindow: boolean('include_window').default(false),
  includeDoor: boolean('include_door').default(false),
  // Notes per spec category
  framingNotes: text('framing_notes'),
  sidingNotes: text('siding_notes'),
  deckNotes: text('deck_notes'),
  trimNotes: text('trim_notes'),
  windowNotes: text('window_notes'),
  doorNotes: text('door_notes'),
  shingleNotes: text('shingle_notes'),
  // File references (legacy — new files use BidFile/R2)
  planFilename: varchar('plan_filename', { length: 255 }),
  emailFilename: varchar('email_filename', { length: 255 }),
  // General
  notes: text('notes'),
  lastUpdatedBy: varchar('last_updated_by', { length: 150 }),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow(),
  branchId: integer('branch_id').references(() => legacyBranch.branchId),
  jobId: integer('job_id').references(() => legacyJob.id),
});

// ============================================================
// BID FILE (S3/R2 attachments)
// ============================================================
export const legacyBidFile = pgTable('bid_file', {
  id: serial('id').primaryKey(),
  bidId: integer('bid_id')
    .notNull()
    .references(() => legacyBid.id),
  fileKey: varchar('file_key', { length: 255 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  fileType: varchar('file_type', { length: 50 }),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

// ============================================================
// BID FIELD (admin-defined dynamic form fields)
// ============================================================
export const legacyBidField = pgTable('bid_field', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).notNull().default('General'),
  fieldType: varchar('field_type', { length: 50 }).notNull().default('text'),
  isRequired: boolean('is_required').default(false),
  options: text('options'),
  defaultValue: varchar('default_value', { length: 255 }),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').notNull().default(true),
  branchIds: text('branch_ids'),
});

// ============================================================
// BID VALUE (dynamic field values per bid)
// ============================================================
export const legacyBidValue = pgTable('bid_value', {
  id: serial('id').primaryKey(),
  bidId: integer('bid_id')
    .notNull()
    .references(() => legacyBid.id),
  fieldId: integer('field_id')
    .notNull()
    .references(() => legacyBidField.id),
  value: text('value'),
});

// ============================================================
// DESIGN
// ============================================================
export const legacyDesign = pgTable('design', {
  id: serial('id').primaryKey(),
  planNumber: varchar('planNumber', { length: 10 }).notNull().unique(),
  planName: varchar('plan_name', { length: 100 }).notNull(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => legacyCustomer.id),
  projectAddress: varchar('project_address', { length: 200 }).notNull(),
  contractor: varchar('contractor', { length: 100 }),
  logDate: timestamp('log_date').defaultNow(),
  preliminarySetDate: timestamp('preliminary_set_date'),
  designerId: integer('designer_id').references(() => legacyDesigner.id),
  status: varchar('status', { length: 50 }).default('Active'),
  planDescription: varchar('plan_description', { length: 50 }),
  notes: text('notes'),
  lastUpdatedBy: varchar('last_updated_by', { length: 150 }),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow(),
  branchId: integer('branch_id').references(() => legacyBranch.branchId),
  squareFootage: integer('square_footage'),
  jobId: integer('job_id').references(() => legacyJob.id),
});

// ============================================================
// PROJECT (bid request / contractor projects)
// ============================================================
export const legacyProject = pgTable('projects', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => legacyCustomer.id),
  salesRepId: integer('sales_rep_id')
    .notNull()
    .references(() => legacyUser.id),
  contractor: varchar('contractor', { length: 255 }).notNull(),
  projectAddress: varchar('project_address', { length: 255 }).notNull(),
  contractorPhone: varchar('contractor_phone', { length: 15 }),
  contractorEmail: varchar('contractor_email', { length: 255 }),
  includeFraming: boolean('include_framing').notNull().default(false),
  includeSiding: boolean('include_siding').notNull().default(false),
  includeShingles: boolean('include_shingles').notNull().default(false),
  includeDeck: boolean('include_deck').notNull().default(false),
  includeDoors: boolean('include_doors').notNull().default(false),
  includeWindows: boolean('include_windows').notNull().default(false),
  includeTrim: boolean('include_trim').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUpdatedBy: varchar('last_updated_by', { length: 150 }),
  lastUpdatedAt: timestamp('last_updated_at').notNull().defaultNow(),
  branchId: integer('branch_id').references(() => legacyBranch.branchId),
});

// ============================================================
// EWP (Engineered Wood Products / Layout tracking)
// ============================================================
export const legacyEWP = pgTable('ewp', {
  id: serial('id').primaryKey(),
  planNumber: varchar('plan_number', { length: 255 }).notNull(),
  salesRepId: integer('sales_rep_id').references(() => legacyUser.id),
  customerId: integer('customer_id')
    .notNull()
    .references(() => legacyCustomer.id),
  address: varchar('address', { length: 255 }).notNull(),
  notes: text('notes'),
  loginDate: date('login_date').notNull(),
  tjiDepth: varchar('tji_depth', { length: 255 }).notNull(),
  assignedDesigner: varchar('assigned_designer', { length: 255 }),
  layoutFinalized: date('layout_finalized'),
  agilityQuote: date('agility_quote'),
  importedStellar: date('imported_stellar'),
  lastUpdatedBy: varchar('last_updated_by', { length: 150 }),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow(),
  branchId: integer('branch_id').references(() => legacyBranch.branchId),
});

// ============================================================
// IT SERVICE (internal issue tracker)
// ============================================================
export const legacyITService = pgTable('it_service', {
  id: serial('id').primaryKey(),
  issueType: varchar('issue_type', { length: 255 }).notNull(),
  createdby: varchar('createdby', { length: 255 }).notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('Open'),
  updatedby: varchar('updatedby', { length: 255 }),
  updatedDate: timestamp('updated_date').defaultNow(),
  notes: text('notes'),
  createdDate: timestamp('createdDate').defaultNow(),
});

// ============================================================
// ACTIVITY TRACKING
// ============================================================
export const legacyLoginActivity = pgTable('login_activity', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => legacyUser.id),
  loggedIn: timestamp('logged_in').notNull().defaultNow(),
  loggedOut: timestamp('logged_out'),
});

export const legacyBidActivity = pgTable('bid_activity', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => legacyUser.id),
  bidId: integer('bid_id')
    .notNull()
    .references(() => legacyBid.id),
  action: varchar('action', { length: 50 }).notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

export const legacyDesignActivity = pgTable('design_activity', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => legacyUser.id),
  designId: integer('design_id')
    .notNull()
    .references(() => legacyDesign.id),
  action: varchar('action', { length: 50 }).notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});

export const legacyGeneralAudit = pgTable('general_audit', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => legacyUser.id),
  modelName: varchar('model_name', { length: 50 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  changes: text('changes'),
});

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================
export const legacyNotificationRule = pgTable('notification_rule', {
  id: serial('id').primaryKey(),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  recipientType: varchar('recipient_type', { length: 50 }).notNull(),
  recipientId: integer('recipient_id'),
  recipientName: varchar('recipient_name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
  branchId: integer('branch_id').references(() => legacyBranch.branchId),
  bidType: varchar('bid_type', { length: 50 }),
});

export const legacyNotificationLog = pgTable('notification_log', {
  id: serial('id').primaryKey(),
  bidId: integer('bid_id').references(() => legacyBid.id),
  eventType: varchar('event_type', { length: 50 }).notNull(),
  recipients: text('recipients'),
  matchedRules: text('matched_rules'),
  status: varchar('status', { length: 50 }).notNull(),
  errorMessage: text('error_message'),
  timestamp: timestamp('timestamp').defaultNow(),
});

// ============================================================
// TYPE EXPORTS
// ============================================================
export type LegacyUser = typeof legacyUser.$inferSelect;
export type LegacyBranch = typeof legacyBranch.$inferSelect;
export type LegacyEstimator = typeof legacyEstimator.$inferSelect;
export type LegacyDesigner = typeof legacyDesigner.$inferSelect;
export type LegacyCustomer = typeof legacyCustomer.$inferSelect;
export type LegacyBid = typeof legacyBid.$inferSelect;
export type LegacyBidFile = typeof legacyBidFile.$inferSelect;
export type LegacyBidField = typeof legacyBidField.$inferSelect;
export type LegacyBidValue = typeof legacyBidValue.$inferSelect;
export type LegacyDesign = typeof legacyDesign.$inferSelect;
export type LegacyJob = typeof legacyJob.$inferSelect;
export type LegacyProject = typeof legacyProject.$inferSelect;
export type LegacyEWP = typeof legacyEWP.$inferSelect;
export type LegacyITService = typeof legacyITService.$inferSelect;
export type LegacyUserType = typeof legacyUserType.$inferSelect;
export type LegacyUserSecurity = typeof legacyUserSecurity.$inferSelect;
export type LegacyBidActivity = typeof legacyBidActivity.$inferSelect;
export type LegacyDesignActivity = typeof legacyDesignActivity.$inferSelect;
export type LegacyLoginActivity = typeof legacyLoginActivity.$inferSelect;
export type LegacyGeneralAudit = typeof legacyGeneralAudit.$inferSelect;
export type LegacyNotificationRule = typeof legacyNotificationRule.$inferSelect;
export type LegacyNotificationLog = typeof legacyNotificationLog.$inferSelect;
