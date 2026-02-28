import {
  pgTable,
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

// ============================================================
// USERS
// ============================================================
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('estimator'),
    // roles: 'admin', 'estimator', 'viewer'
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)]
);

// ============================================================
// CUSTOMERS
// ============================================================
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 50 }).unique(),
    name: varchar('name', { length: 255 }).notNull(),
    address: varchar('address', { length: 255 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 50 }),
    zip: varchar('zip', { length: 20 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    contactName: varchar('contact_name', { length: 255 }),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (table) => [
    index('customers_name_idx').on(table.name),
    index('customers_code_idx').on(table.code),
  ]
);

// ============================================================
// BIDS
// ============================================================
export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bidNumber: varchar('bid_number', { length: 50 }).unique(),
    // auto-generated: BID-2024-0001
    jobName: varchar('job_name', { length: 255 }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    customerCode: varchar('customer_code', { length: 50 }),
    customerName: varchar('customer_name', { length: 255 }),
    estimatorId: uuid('estimator_id').references(() => users.id),
    estimatorName: varchar('estimator_name', { length: 255 }).notNull(),
    branch: varchar('branch', { length: 50 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('draft'),
    // statuses: 'draft', 'submitted', 'won', 'lost', 'archived'
    inputs: jsonb('inputs').notNull(),
    // Full JobInputs object
    lineItems: jsonb('line_items'),
    // Calculated LineItem[]
    bidSummary: jsonb('bid_summary'),
    // { groups: {...}, options: [...], totals: {...} }
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    submittedAt: timestamp('submitted_at'),
    wonAt: timestamp('won_at'),
    lostAt: timestamp('lost_at'),
    createdBy: uuid('created_by').references(() => users.id),
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
export const bidVersions = pgTable('bid_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  bidId: uuid('bid_id')
    .notNull()
    .references(() => bids.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  inputs: jsonb('inputs').notNull(),
  lineItems: jsonb('line_items'),
  changeNote: text('change_note'),
  changedBy: uuid('changed_by').references(() => users.id),
  changedAt: timestamp('changed_at').notNull().defaultNow(),
});

// ============================================================
// PRODUCTS / SKUs
// ============================================================
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: varchar('sku', { length: 100 }).notNull().unique(),
    description: varchar('description', { length: 500 }).notNull(),
    uom: varchar('uom', { length: 50 }).notNull(),
    category: varchar('category', { length: 100 }),
    // e.g., 'framing', 'siding', 'hardware', 'deck', 'roofing', 'trim'
    branchOverrides: jsonb('branch_overrides'),
    // { grimes: 'altSKU', fort_dodge: 'altSKU' }
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('products_category_idx').on(table.category),
    uniqueIndex('products_sku_idx').on(table.sku),
  ]
);

// ============================================================
// MULTIPLIERS / FORMULAS
// ============================================================
export const multipliers = pgTable(
  'multipliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 200 }).notNull().unique(),
    // e.g., 'framing.stud_multiplier_main.value'
    value: numeric('value', { precision: 14, scale: 8 }).notNull(),
    description: varchar('description', { length: 500 }),
    category: varchar('category', { length: 100 }),
    // e.g., 'framing', 'sheathing', 'moisture_barrier', 'siding'
    isEditable: boolean('is_editable').notNull().default(true),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => [
    index('multipliers_category_idx').on(table.category),
    uniqueIndex('multipliers_key_idx').on(table.key),
  ]
);

// ============================================================
// BRANCHES
// ============================================================
export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  // 'grimes', 'fort_dodge', 'coralville'
  name: varchar('name', { length: 255 }).notNull(),
  address: varchar('address', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  phone: varchar('phone', { length: 50 }),
  settings: jsonb('settings'),
  // { stud_sku: '...', stud_sku_9ft: '...', etc. }
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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

export const usersRelations = relations(users, ({ many }) => ({
  bids: many(bids),
  bidVersionsChanged: many(bidVersions),
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
