/**
 * Run geocode matching directly against Supabase (same logic as geocode-nightly cron).
 * Loops until no new matches or remaining_failed = 0.
 *
 * Run:
 *   POSTGRES_URL_NON_POOLING=... npx tsx scripts/run-geocode-batch.ts
 */
import { getErpSql } from '../db/supabase';
import { runGeocodeBatch } from '../src/lib/geocode-runner';

async function main() {
  const sql = getErpSql();
  let totalMatched = 0;
  let pass = 0;
  let consecutiveEmpty = 0;

  console.log('Starting geocode batch loop (state=IA, batchSize=2000)...\n');

  while (true) {
    pass++;
    const result = await runGeocodeBatch(sql, { state: 'IA', batchSize: 2000 });
    const matched = result.matched_city + result.matched_zip + result.matched_state_unique;
    totalMatched += matched;
    console.log(
      `Pass ${pass}: attempted=${result.attempted} matched=${matched}` +
        ` (city=${result.matched_city} zip=${result.matched_zip} state=${result.matched_state_unique})` +
        ` remaining=${result.remaining_failed}`,
    );
    if (matched === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
    } else {
      consecutiveEmpty = 0;
    }
    if (result.attempted === 0 || result.remaining_failed === 0) break;
  }

  console.log(`\nTotal new matches: ${totalMatched}`);
  await sql.end();
}

main().catch((err) => {
  console.error('Geocode batch failed:', err);
  process.exit(1);
});
