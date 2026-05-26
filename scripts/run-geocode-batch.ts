/**
 * Run geocode matching directly against Supabase (same logic as geocode-nightly cron).
 * Loops until no new matches or remaining_failed = 0.
 *
 * Run:
 *   POSTGRES_URL_NON_POOLING=... npx tsx scripts/run-geocode-batch.ts
 */
import { getErpSql } from '../db/supabase';
import { runGeocodeBatch } from '../src/lib/geocode-runner';

// Hard cap so a bug in the runner can't pin a long-lived process. At
// batchSize=2000 this caps the script at ~200K rows of work — plenty for
// any single nightly run of the IA backlog (~12K unmatched at writing).
const MAX_PASSES = 100;

async function main() {
  const sql = getErpSql();
  let totalMatched = 0;
  let pass = 0;
  let prevRemaining: number | null = null;

  console.log('Starting geocode batch loop (state=IA, batchSize=2000)...\n');

  while (pass < MAX_PASSES) {
    pass++;
    const result = await runGeocodeBatch(sql, { state: 'IA', batchSize: 2000 });
    const matched = result.matched_city + result.matched_zip + result.matched_state_unique;
    totalMatched += matched;
    console.log(
      `Pass ${pass}: attempted=${result.attempted} matched=${matched}` +
        ` (city=${result.matched_city} zip=${result.matched_zip} state=${result.matched_state_unique})` +
        ` remaining=${result.remaining_failed}`,
    );

    // Real terminal conditions:
    //   - attempted=0: the runner had no candidates to even try.
    //   - remaining_failed=0: nothing left in the unmatched queue.
    if (result.attempted === 0 || result.remaining_failed === 0) break;

    // Stall detection: if remaining_failed hasn't budged AND we matched
    // nothing this pass, the runner is cycling on the same unmatchable
    // tail and further passes won't help. (The runner orders by oldest
    // geocoded_at and bumps every attempted row to NOW(), so one full
    // sweep is enough to confirm we're stuck.) An earlier version of
    // this loop broke after 3 zero-match passes regardless of queue
    // depth, which could quit early when a 2000-row prefix of
    // unmatchable rows blocked a still-matchable tail — see Codex
    // P1 comment_id=3306384502.
    if (matched === 0 && prevRemaining !== null && result.remaining_failed >= prevRemaining) break;
    prevRemaining = result.remaining_failed;
  }

  if (pass >= MAX_PASSES) {
    console.warn(`\nHit MAX_PASSES=${MAX_PASSES}; rerun if remaining_failed is still high.`);
  }
  console.log(`\nTotal new matches: ${totalMatched}`);
  await sql.end();
}

main().catch((err) => {
  console.error('Geocode batch failed:', err);
  process.exit(1);
});
