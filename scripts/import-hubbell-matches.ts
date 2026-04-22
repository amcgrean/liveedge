/**
 * One-time import: sync historical Hubbell PO/WO → Agility job matches into hubbell_emails.
 *
 * Source: scripts/hubbell_matches_data.json
 * Each record maps a Hubbell doc_id (PO or WO number) to an Agility SO via agility_job_seq.
 *
 * Run with:
 *   npx tsx scripts/import-hubbell-matches.ts
 *
 * Requires POSTGRES_URL_NON_POOLING (or POSTGRES_URL / BIDS_DATABASE_URL) in env.
 * Safe to re-run — uses message_id ON CONFLICT DO NOTHING to skip duplicates.
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
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
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

// ERP uses the same Supabase instance — public schema
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading match data...');
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/hubbell_matches_data.json'), 'utf-8')
  );
  const matches: MatchRecord[] = raw.po_wo_to_job_matches;
  console.log(`  ${matches.length} records, ${new Set(matches.map(m => m.agility_job_seq)).size} unique job seqs`);

  // ── Step 0: Delete any previously imported records (full re-import) ─────────
  console.log('\nCleaning up previous import records...');
  const deleted = await db
    .delete(schema.hubbellEmails)
    .where(eq(schema.hubbellEmails.confirmedBy, 'json_import'))
    .returning({ id: schema.hubbellEmails.id });
  console.log(`  Deleted ${deleted.length} existing import records`);

  // ── Step 1: Fetch SO details from ERP ───────────────────────────────────────
  const uniqueJobSeqs = [...new Set(matches.map(m => String(m.agility_job_seq)))];
  console.log(`\nQuerying agility_so_header for ${uniqueJobSeqs.length} job seqs...`);

  const soRows = await erpSql<SoRow[]>`
    SELECT
      so_id::text,
      TRIM(cust_code)  AS cust_code,
      cust_name,
      shipto_address_1,
      shipto_city,
      shipto_state,
      shipto_zip
    FROM agility_so_header
    WHERE so_id::text = ANY(${uniqueJobSeqs})
      AND TRIM(cust_code) ILIKE 'HUBB%'
  `;

  const soMap = new Map(soRows.map(r => [r.so_id, r]));
  console.log(`  Found ${soMap.size} / ${uniqueJobSeqs.length} SOs in ERP`);

  const missingSeqs = uniqueJobSeqs.filter(s => !soMap.has(s));
  if (missingSeqs.length > 0) {
    console.warn(`  WARNING: ${missingSeqs.length} job seqs not found in agility_so_header:`);
    console.warn('  ', missingSeqs.slice(0, 20).join(', '));
  }

  // ── Step 2: Build and insert hubbell_emails rows ────────────────────────────
  console.log('\nInserting hubbell_emails records...');

  let inserted = 0;
  let skipped = 0;
  let noSo = 0;
  const BATCH = 50;

  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    const values = [];

    for (const m of batch) {
      const so = soMap.get(String(m.agility_job_seq));
      if (!so) { noSo++; continue; }

      // Synthetic message-id ensures idempotent re-runs
      const messageId = `import-hubbell-${m.doc_type}-${m.doc_id}@beisser.cloud`;

      // Use address from ERP SO (more reliable than PDF) if available,
      // fall back to the PDF-extracted address
      const address   = so.shipto_address_1 ?? m.ship_to_address ?? null;
      const city      = so.shipto_city      ?? m.ship_to_city    ?? null;
      const state     = so.shipto_state     ?? m.ship_to_state   ?? null;
      const zip       = so.shipto_zip       ?? (m.ship_to_zip != null ? String(m.ship_to_zip) : null);

      // Format doc_id as zero-padded number matching Hubbell's naming convention
      // PO: 6 digits (e.g., 1597 → "001597"), WO: 8 digits (e.g., 1004 → "00001004")
      const docFormatted = m.doc_type === 'wo'
        ? String(m.doc_id).padStart(8, '0')
        : String(m.doc_id).padStart(6, '0');

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
  console.log(`  No SO found: ${noSo}`);
  console.log(`  Total processed: ${matches.length - noSo}`);
  console.log('─────────────────────────────────────────');
  console.log('\nDone.');

  await bidsSql.end();
  await erpSql.end();
}

main().catch(err => {
  console.error('\nImport failed:', err);
  process.exit(1);
});
