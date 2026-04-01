import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
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
