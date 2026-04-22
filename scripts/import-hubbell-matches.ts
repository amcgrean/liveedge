/**
 * One-time import: sync historical Hubbell PO/WO → Agility job matches into hubbell_emails.
 *
 * Source: scripts/hubbell_matches_data.json
 * Strategy: agility_job_seq is NOT the so_id — instead we fetch all Hubbell SOs and
 * match each JSON job_seq group to the SO whose shipto_address best matches the PDF address.
 *
 * Run with:
 *   npx tsx scripts/import-hubbell-matches.ts
 *
 * Requires POSTGRES_URL_NON_POOLING (or POSTGRES_URL / BIDS_DATABASE_URL) in env.
 * Safe to re-run — deletes previous json_import records first, then re-inserts.
 */

import { readFileSync as _readFileSync, existsSync } from 'fs';
import { join as _join } from 'path';

// Load .env.local so the script works outside of Next.js context
try {
  const envFile = _join(process.cwd(), '.env.local');
  if (existsSync(envFile)) {
    for (const line of _readFileSync(envFile, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Database connections ─────────────────────────────────────────────────────

const dbUrl =
  process.env.BIDS_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!dbUrl) {
  console.error('ERROR: Set BIDS_DATABASE_URL or POSTGRES_URL_NON_POOLING');
  process.exit(1);
}

const erpUrl =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.BIDS_DATABASE_URL;

const bidsSql = postgres(dbUrl, { max: 1, prepare: false });
const db = drizzle(bidsSql, { schema });
const erpSql = postgres(erpUrl!, { max: 1, prepare: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchRecord = {
  check_number: number;
  doc_type: 'po' | 'wo';
  doc_id: number;
  pdf_file: string;
  pdf_total: number | null;
  ship_to_address: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: number | null;
  address_source: string | null;
  agility_job_seq: number;
  agility_cust_code: string;
  match_ratio: number;
  match_reason: string;
};

type SoRow = {
  so_id: string;
  cust_code: string | null;
  cust_name: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
};

// ─── Address matching helpers ─────────────────────────────────────────────────

function normalizeAddr(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr').replace(/\blane\b/g, 'ln')
    .replace(/\broad\b/g, 'rd').replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir').replace(/\bplace\b/g, 'pl')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function addrSimilarity(a: string | null, b: string | null): number {
  const na = normalizeAddr(a);
  const nb = normalizeAddr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading match data...');
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/hubbell_matches_data.json'), 'utf-8')
  );
  const matches: MatchRecord[] = raw.po_wo_to_job_matches;
  const uniqueJobSeqs = [...new Set(matches.map(m => m.agility_job_seq))];
  console.log(`  ${matches.length} records, ${uniqueJobSeqs.length} unique job seqs`);

  // ── Step 0: Delete previous import records ──────────────────────────────────
  console.log('\nCleaning up previous import records...');
  const deleted = await db
    .delete(schema.hubbellEmails)
    .where(eq(schema.hubbellEmails.confirmedBy, 'json_import'))
    .returning({ id: schema.hubbellEmails.id });
  console.log(`  Deleted ${deleted.length} existing import records`);

  // ── Step 1: Fetch ALL Hubbell SOs from ERP ──────────────────────────────────
  console.log('\nFetching all Hubbell SOs from agility_so_header...');
  const allHubbellSos = await erpSql<SoRow[]>`
    SELECT
      so_id::text,
      TRIM(cust_code)  AS cust_code,
      cust_name,
      shipto_address_1,
      shipto_city,
      shipto_state,
      shipto_zip
    FROM agility_so_header
    WHERE TRIM(cust_code) IN ('HUBB1200', 'HUBB1700', 'HUBB1400')
      AND is_deleted = false
      AND shipto_address_1 IS NOT NULL
  `;
  console.log(`  Found ${allHubbellSos.length} Hubbell SOs`);

  // ── Step 2: Build job_seq → SO map via address matching ─────────────────────
  console.log('\nMatching job seqs to SOs by address...');

  // Build one representative address per job_seq (take first record in group)
  const jobSeqAddress = new Map<number, { address: string | null; city: string | null; state: string | null; zip: string | null }>();
  for (const m of matches) {
    if (!jobSeqAddress.has(m.agility_job_seq)) {
      jobSeqAddress.set(m.agility_job_seq, {
        address: m.ship_to_address,
        city:    m.ship_to_city,
        state:   m.ship_to_state,
        zip:     m.ship_to_zip != null ? String(m.ship_to_zip) : null,
      });
    }
  }

  // For each job_seq, find the best-matching Hubbell SO by address + city
  const jobSeqToSo = new Map<number, SoRow>();
  let matched = 0;
  let unmatched = 0;

  for (const [jobSeq, addr] of jobSeqAddress) {
    let bestSo: SoRow | null = null;
    let bestScore = 0;

    for (const so of allHubbellSos) {
      const addrScore = addrSimilarity(addr.address, so.shipto_address_1);
      const cityMatch = normalizeAddr(addr.city) === normalizeAddr(so.shipto_city) ? 0.3 : 0;
      const score = addrScore + cityMatch;
      if (score > bestScore) {
        bestScore = score;
        bestSo = so;
      }
    }

    // Require at least 60% address word overlap to accept the match
    if (bestSo && bestScore >= 0.6) {
      jobSeqToSo.set(jobSeq, bestSo);
      matched++;
    } else {
      unmatched++;
      const addrStr = addr.address ?? '(no address)';
      console.log(`  No match for job_seq ${jobSeq}: "${addrStr}, ${addr.city}" (best score: ${bestScore.toFixed(2)})`);
    }
  }

  console.log(`  Matched: ${matched} / ${uniqueJobSeqs.length} job seqs`);

  // ── Step 3: Insert hubbell_emails rows ──────────────────────────────────────
  console.log('\nInserting hubbell_emails records...');

  let inserted = 0;
  let skipped = 0;
  let noSo = 0;
  const BATCH = 50;

  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    const values = [];

    for (const m of batch) {
      const so = jobSeqToSo.get(m.agility_job_seq);
      if (!so) { noSo++; continue; }

      const messageId = `import-hubbell-${m.doc_type}-${m.doc_id}@beisser.cloud`;

      const docFormatted = m.doc_type === 'wo'
        ? String(m.doc_id).padStart(8, '0')
        : String(m.doc_id).padStart(6, '0');

      // Prefer ERP shipto address (canonical), fall back to PDF address
      const address = so.shipto_address_1 ?? m.ship_to_address ?? null;
      const city    = so.shipto_city      ?? m.ship_to_city    ?? null;
      const state   = so.shipto_state     ?? m.ship_to_state   ?? null;
      const zip     = so.shipto_zip       ?? (m.ship_to_zip != null ? String(m.ship_to_zip) : null);

      values.push({
        messageId,
        fromEmail:  'hubbell@beisser.cloud',
        fromName:   'Hubbell Homes (imported)',
        subject:    `[Import] ${m.doc_type.toUpperCase()} ${docFormatted} — Check #${m.check_number}`,
        bodyText:   null,
        emailType:  m.doc_type,
        extractedPoNumber: m.doc_type === 'po' ? docFormatted : null,
        extractedWoNumber: m.doc_type === 'wo' ? docFormatted : null,
        extractedAddress: address,
        extractedCity:    city,
        extractedState:   state,
        extractedZip:     zip,
        extractedAmount:  m.pdf_total != null ? String(m.pdf_total) : null,
        extractedTaxAmount:    null,
        extractedShipping:     null,
        extractedNeedByDate:   null,
        extractedContactName:  null,
        extractedContactPhone: null,
        extractedDescription:  null,
        matchStatus:       'confirmed',
        confirmedSoId:     so.so_id,
        confirmedCustCode: so.cust_code ?? m.agility_cust_code,
        confirmedCustName: so.cust_name ?? null,
        matchConfidence:   String(Math.round(m.match_ratio * 100)),
        confirmedBy:       'json_import',
        confirmedAt:       new Date('2026-04-22T00:00:00Z'),
        receivedAt:        new Date('2026-04-22T00:00:00Z'),
      });
    }

    if (values.length === 0) continue;

    const result = await db
      .insert(schema.hubbellEmails)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: schema.hubbellEmails.id });

    inserted += result.length;
    skipped  += values.length - result.length;

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, matches.length)} / ${matches.length} processed`);
  }

  console.log('\n');
  console.log('── Results ──────────────────────────────');
  console.log(`  Inserted:  ${inserted}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  No SO matched: ${noSo}`);
  console.log(`  Total inserted: ${inserted}`);
  console.log('─────────────────────────────────────────');
  console.log('\nDone.');

  await bidsSql.end();
  await erpSql.end();
}

main().catch(err => {
  console.error('\nImport failed:', err);
  process.exit(1);
});
