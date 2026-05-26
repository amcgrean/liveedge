/**
 * sync-neon-to-supabase.mjs
 *
 * Syncs pa-bid-request (Neon) → LiveEdge (Supabase) for the bids.bid table.
 *
 * Run in DRY RUN mode first:   node scripts/sync-neon-to-supabase.mjs
 * Run for real:                node scripts/sync-neon-to-supabase.mjs --apply
 *
 * What it does:
 *   1. INSERTs new bids (id > max LiveEdge id) from Neon into Supabase
 *   2. UPDATEs status + completion_date for bids that changed in Neon since migration
 *   3. Syncs any new customers, jobs, estimators referenced by new bids
 *   4. Syncs bid_values for new bids
 *   5. Reports any plan_filename / email_filename on new bids that need S3→R2 file copy
 */

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

const NEON_URL = 'postgresql://neondb_owner:npg_1E4CvgZbaVBW@ep-fragrant-waterfall-ad8fjcey-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const SUPA_URL = process.env.POSTGRES_URL_NON_POOLING || process.env.BIDS_DATABASE_URL;

if (!SUPA_URL) {
  console.error('ERROR: Set POSTGRES_URL_NON_POOLING or BIDS_DATABASE_URL env var');
  process.exit(1);
}

const neon = postgres(NEON_URL, { max: 1, prepare: false });
const supa = postgres(SUPA_URL, { max: 1, prepare: false });

console.log(APPLY ? '🚀 APPLY MODE — changes will be written' : '🔍 DRY RUN — no changes written (pass --apply to commit)');
console.log('');

// ── 1. Find the gap ─────────────────────────────────────────────────────────

const [supaMax] = await supa`SELECT MAX(id) AS max_id FROM bids.bid`;
const maxId = supaMax.max_id;
console.log(`LiveEdge max bid ID: ${maxId}`);

// New bids: exist in Neon but not in Supabase
const newBids = await neon`
  SELECT * FROM bid WHERE id > ${maxId} ORDER BY id ASC
`;
console.log(`New bids to insert: ${newBids.length}`);

// Status drift: bids that are Complete in Neon but Incomplete in LiveEdge
const statusDrift = await neon`
  SELECT id, status, completion_date, last_updated_by, last_updated_at
  FROM bid
  WHERE id <= ${maxId}
    AND status = 'Complete'
`;
// We'll cross-reference against LiveEdge below
const driftIds = statusDrift.map(r => r.id);

let driftToFix = [];
if (driftIds.length > 0) {
  driftToFix = await supa`
    SELECT id FROM bids.bid
    WHERE id = ANY(${driftIds}::int[])
      AND status = 'Incomplete'
  `;
}
console.log(`Status updates needed (Neon=Complete, LiveEdge=Incomplete): ${driftToFix.length}`);
console.log('');

// ── 2. Check FK dependencies for new bids ──────────────────────────────────

if (newBids.length > 0) {
  const newCustomerIds = [...new Set(newBids.map(b => b.customer_id).filter(Boolean))];
  const newJobIds = [...new Set(newBids.map(b => b.job_id).filter(Boolean))];
  const newEstimatorIds = [...new Set(newBids.map(b => b.estimator_id).filter(Boolean))];
  const newSalesRepIds = [...new Set(newBids.map(b => b.sales_rep_id).filter(Boolean))];

  // Check which customers are missing in LiveEdge
  const existingCustomers = newCustomerIds.length > 0
    ? await supa`SELECT id FROM bids.customer WHERE id = ANY(${newCustomerIds}::int[])`
    : [];
  const existingCustomerIds = new Set(existingCustomers.map(r => r.id));
  const missingCustomerIds = newCustomerIds.filter(id => !existingCustomerIds.has(id));

  // Check which jobs are missing
  const existingJobs = newJobIds.length > 0
    ? await supa`SELECT id FROM bids.job WHERE id = ANY(${newJobIds}::int[])`
    : [];
  const existingJobIds = new Set(existingJobs.map(r => r.id));
  const missingJobIds = newJobIds.filter(id => !existingJobIds.has(id));

  // Check estimators (PK is estimatorID in both Neon and LiveEdge)
  const existingEstimators = newEstimatorIds.length > 0
    ? await supa`SELECT "estimatorID" FROM bids.estimator WHERE "estimatorID" = ANY(${newEstimatorIds}::int[])`
    : [];
  const existingEstimatorIds = new Set(existingEstimators.map(r => r.estimatorID));
  const missingEstimatorIds = newEstimatorIds.filter(id => !existingEstimatorIds.has(id));

  // Check sales reps (user table)
  const existingReps = newSalesRepIds.length > 0
    ? await supa`SELECT id FROM bids."user" WHERE id = ANY(${newSalesRepIds}::int[])`
    : [];
  const existingRepIds = new Set(existingReps.map(r => r.id));
  const missingRepIds = newSalesRepIds.filter(id => !existingRepIds.has(id));

  console.log(`FK check for new bids:`);
  console.log(`  Customers referenced: ${newCustomerIds.length} | Missing: ${missingCustomerIds.length} → ${missingCustomerIds.join(', ') || 'none'}`);
  console.log(`  Jobs referenced: ${newJobIds.length} | Missing: ${missingJobIds.length} → ${missingJobIds.join(', ') || 'none'}`);
  console.log(`  Estimators referenced: ${newEstimatorIds.length} | Missing: ${missingEstimatorIds.length} → ${missingEstimatorIds.join(', ') || 'none'}`);
  console.log(`  Sales reps referenced: ${newSalesRepIds.length} | Missing: ${missingRepIds.length} → ${missingRepIds.join(', ') || 'none'}`);
  console.log('');

  // Sync missing customers
  if (missingCustomerIds.length > 0) {
    const missingCustomers = await neon`SELECT * FROM customer WHERE id = ANY(${missingCustomerIds}::int[])`;
    console.log(`Customers to insert: ${missingCustomers.length}`);
    missingCustomers.forEach(c => console.log(`  → id=${c.id} code=${c.customer_code} name=${c.name}`));
    if (APPLY && missingCustomers.length > 0) {
      for (const c of missingCustomers) {
        await supa`
          INSERT INTO bids.customer (id, customer_code, name, branch_id)
          VALUES (${c.id}, ${c.customer_code}, ${c.name}, ${c.branch_id})
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log(`  ✓ Customers inserted`);
    }
    console.log('');
  }

  // Sync missing jobs
  if (missingJobIds.length > 0) {
    const missingJobs = await neon`SELECT * FROM job WHERE id = ANY(${missingJobIds}::int[])`;
    console.log(`Jobs to insert: ${missingJobs.length}`);
    missingJobs.forEach(j => console.log(`  → id=${j.id} customer_id=${j.customer_id} name=${j.job_name}`));
    if (APPLY && missingJobs.length > 0) {
      for (const j of missingJobs) {
        await supa`
          INSERT INTO bids.job (id, customer_id, job_reference, job_name, status)
          VALUES (${j.id}, ${j.customer_id}, ${j.job_reference}, ${j.job_name}, ${j.status})
          ON CONFLICT (id) DO NOTHING
        `;
      }
      console.log(`  ✓ Jobs inserted`);
    }
    console.log('');
  }

  // Sync missing estimators
  if (missingEstimatorIds.length > 0) {
    const missingEstimators = await neon`SELECT * FROM estimator WHERE "estimatorID" = ANY(${missingEstimatorIds}::int[])`;
    console.log(`Estimators to insert: ${missingEstimators.length}`);
    missingEstimators.forEach(e => console.log(`  → id=${e.estimatorID} name=${e.estimatorName}`));
    if (APPLY && missingEstimators.length > 0) {
      for (const e of missingEstimators) {
        await supa`
          INSERT INTO bids.estimator ("estimatorID", "estimatorName", "estimatorUsername")
          VALUES (${e.estimatorID}, ${e.estimatorName}, ${e.estimatorUsername})
          ON CONFLICT ("estimatorID") DO NOTHING
        `;
      }
      console.log(`  ✓ Estimators inserted`);
    }
    console.log('');
  }

  // ── 3. Insert new bids ───────────────────────────────────────────────────

  console.log(`Bids to insert (id ${newBids[0]?.id} → ${newBids[newBids.length - 1]?.id}):`);
  newBids.forEach(b => console.log(`  → id=${b.id} "${b.project_name}" ${b.status} ${b.log_date?.toISOString().slice(0,10)}`));
  console.log('');

  if (APPLY) {
    for (const b of newBids) {
      await supa`
        INSERT INTO bids.bid (
          id, plan_type, customer_id, sales_rep_id, project_name, estimator_id,
          status, log_date, due_date, completion_date, bid_date, flexible_bid_date,
          include_specs, include_framing, include_siding, include_shingle,
          include_deck, include_trim, include_window, include_door,
          framing_notes, siding_notes, deck_notes, trim_notes,
          window_notes, door_notes, shingle_notes,
          plan_filename, email_filename, notes,
          last_updated_by, last_updated_at, branch_id, job_id
        ) VALUES (
          ${b.id}, ${b.plan_type}, ${b.customer_id}, ${b.sales_rep_id}, ${b.project_name}, ${b.estimator_id},
          ${b.status}, ${b.log_date}, ${b.due_date}, ${b.completion_date}, ${b.bid_date}, ${b.flexible_bid_date},
          ${b.include_specs}, ${b.include_framing}, ${b.include_siding}, ${b.include_shingle},
          ${b.include_deck}, ${b.include_trim}, ${b.include_window}, ${b.include_door},
          ${b.framing_notes}, ${b.siding_notes}, ${b.deck_notes}, ${b.trim_notes},
          ${b.window_notes}, ${b.door_notes}, ${b.shingle_notes},
          ${b.plan_filename}, ${b.email_filename}, ${b.notes},
          ${b.last_updated_by}, ${b.last_updated_at}, ${b.branch_id}, ${b.job_id}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`  ✓ ${newBids.length} bids inserted`);
  }
}

// ── 4. Fix status drift ─────────────────────────────────────────────────────

if (driftToFix.length > 0) {
  const driftFixIds = driftToFix.map(r => r.id);
  const driftData = statusDrift.filter(r => driftFixIds.includes(r.id));

  console.log(`Status updates (setting to Complete in LiveEdge):`);
  driftData.forEach(r => console.log(`  → id=${r.id} completed=${r.completion_date?.toISOString?.()?.slice(0,10) ?? 'null'} by=${r.last_updated_by}`));
  console.log('');

  if (APPLY) {
    for (const r of driftData) {
      await supa`
        UPDATE bids.bid
        SET status = 'Complete',
            completion_date = ${r.completion_date},
            last_updated_by = ${r.last_updated_by},
            last_updated_at = ${r.last_updated_at}
        WHERE id = ${r.id}
      `;
    }
    console.log(`  ✓ ${driftData.length} bids updated to Complete`);
  }
}

// ── 5. Sync bid_values for new bids ────────────────────────────────────────

if (newBids.length > 0) {
  const newBidIds = newBids.map(b => b.id);
  const newValues = await neon`
    SELECT * FROM bid_value WHERE bid_id = ANY(${newBidIds}::int[])
  `;
  console.log(`\nBid values to sync for new bids: ${newValues.length}`);
  if (APPLY && newValues.length > 0) {
    for (const v of newValues) {
      await supa`
        INSERT INTO bids.bid_value (id, bid_id, field_id, value)
        VALUES (${v.id}, ${v.bid_id}, ${v.field_id}, ${v.value})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`  ✓ ${newValues.length} bid values inserted`);
  }
}

// ── 6. Report files needing S3→R2 copy ─────────────────────────────────────

const bidsWithFiles = newBids.filter(b => b.plan_filename || b.email_filename);
if (bidsWithFiles.length > 0) {
  console.log(`\n⚠️  New bids with S3 files that need copying to R2:`);
  bidsWithFiles.forEach(b => {
    if (b.plan_filename) console.log(`  id=${b.id} plan: ${b.plan_filename}`);
    if (b.email_filename) console.log(`  id=${b.id} email: ${b.email_filename}`);
  });
} else {
  console.log(`\n✓ No S3 files to copy for new bids`);
}

// ── 7. Check bid_files table for new bids ──────────────────────────────────

if (newBids.length > 0) {
  const newBidIds = newBids.map(b => b.id);
  const newBidFiles = await neon`
    SELECT * FROM bid_file WHERE bid_id = ANY(${newBidIds}::int[])
  `;
  if (newBidFiles.length > 0) {
    console.log(`\n⚠️  bid_file records for new bids (S3 keys need R2 copy):`);
    newBidFiles.forEach(f => console.log(`  bid_id=${f.bid_id} file=${f.filename} key=${f.file_key}`));
  } else {
    console.log(`✓ No bid_file attachments for new bids`);
  }
}

// ── Done ────────────────────────────────────────────────────────────────────

await neon.end();
await supa.end();

console.log('');
if (!APPLY) {
  console.log('👆 DRY RUN complete. Run with --apply to commit changes.');
} else {
  console.log('✅ Sync complete.');
}
