/**
 * Reset geocoded_at = NULL on `agility_customers` rows whose `geocode_source`
 * is 'failed' and whose city falls in a target list. Pushes those rows back
 * to the front of the matcher queue so the next /api/cron/geocode-nightly run
 * re-attempts them against the now-loaded geocode_index.
 *
 * Why this script: Supabase has a 60s statement timeout that kills any single
 * UPDATE touching too many rows of `agility_customers` (heavy indexes).
 * Loop in 200-row chunks instead.
 *
 * Usage:
 *   $env:POSTGRES_URL_NON_POOLING=...
 *   npx tsx scripts/reset-geocode-attempts.ts --cities "DES MOINES,ANKENY,..."
 */
import postgres from 'postgres';

const CHUNK = 200;

async function main() {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.BIDS_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Set POSTGRES_URL_NON_POOLING');

  const arg = process.argv.find((a) => a.startsWith('--cities='));
  const citiesArg = arg ? arg.slice('--cities='.length) : process.argv[process.argv.indexOf('--cities') + 1];
  if (!citiesArg) throw new Error('Pass --cities "CITY1,CITY2,..."');
  const cities = citiesArg.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

  const sql = postgres(url, {
    prepare: false,
    max: 1,
    connection: { statement_timeout: '300000' }, // 5 min, override Supabase 60s default
  });

  let totalReset = 0;
  let round = 0;
  for (;;) {
    round++;
    const ids = await sql<{ id: number }[]>`
      SELECT id FROM public.agility_customers
      WHERE geocode_source = 'failed'
        AND UPPER(TRIM(state)) = 'IA'
        AND UPPER(TRIM(city)) = ANY(${cities}::text[])
        AND geocoded_at IS NOT NULL
        AND COALESCE(TRIM(address_1),'') <> ''
        AND address_1 ~ '[0-9]'
      ORDER BY id
      LIMIT ${CHUNK}
    `;
    if (ids.length === 0) break;
    const idList = ids.map((r) => r.id);
    await sql`
      UPDATE public.agility_customers
         SET geocoded_at = NULL
       WHERE id = ANY(${idList}::bigint[])
    `;
    totalReset += idList.length;
    process.stdout.write(`\r  round ${round}: reset ${totalReset} rows`);
  }
  process.stdout.write('\n');

  const [{ pending }] = await sql<{ pending: number }[]>`
    SELECT COUNT(*)::int AS pending FROM public.agility_customers
    WHERE geocode_source = 'failed'
      AND UPPER(TRIM(state)) = 'IA'
      AND UPPER(TRIM(city)) = ANY(${cities}::text[])
      AND geocoded_at IS NULL
  `;
  console.log(`Done. ${totalReset} rows reset; ${pending} now queued at front of matcher.`);

  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
