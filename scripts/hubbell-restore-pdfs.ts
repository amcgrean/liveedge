#!/usr/bin/env tsx
/* eslint-disable no-console */
// Restore the R2 PDFs for hubbell_documents rows whose R2 object was
// overwritten when Hubbell reused a (doc_type, doc_number) for a new job.
// PR #405 added a reconciler-side skip so those rows stop generating
// mismatched suggestions; PR #407 fixed the keying so future re-uploads
// don't collide; this script closes the loop by recovering the lost PDFs
// from the local cache at "C:\Users\amcgrean\python\hubbell test\".
//
// Flow:
//   1. Pull the list of stale-divergent doc rows from prod (their
//      source_hashes are the ground truth for what to look for).
//   2. Walk the local cache, sha256 each PDF, build a hash → path index.
//   3. For each target row, look up the local PDF by hash and POST it to
//      /api/admin/hubbell/backfill — that endpoint verifies the hash,
//      writes a fresh R2 object under the new keyed shape, and updates
//      hubbell_documents.r2_key.
//   4. Report counts + the rows we couldn't find a PDF for.
//
// Run (PowerShell):
//   $env:LIVEEDGE_HUBBELL_TOKEN=<from Vercel>
//   $env:HUBBELL_LOCAL_CACHE='C:\Users\amcgrean\python\hubbell test'
//   $env:POSTGRES_URL_NON_POOLING=<from .env.local>
//   npx tsx scripts/hubbell-restore-pdfs.ts
//
// Options:
//   --dry-run        Skip the POST step; just report what we'd repair.
//   --limit <n>      Cap rows processed (default: all stale-divergent).
//   --concurrency <n>  Parallel POSTs (default 4).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';

const BASE_URL = (process.env.LIVEEDGE_BASE_URL ?? 'https://app.beisser.cloud').replace(/\/$/, '');
const TOKEN = process.env.LIVEEDGE_HUBBELL_TOKEN;
const CACHE_ROOT = process.env.HUBBELL_LOCAL_CACHE ?? String.raw`C:\Users\amcgrean\python\hubbell test`;
const DB_URL = process.env.POSTGRES_URL_NON_POOLING;

if (!TOKEN) { console.error('Missing LIVEEDGE_HUBBELL_TOKEN env var'); process.exit(1); }
if (!DB_URL) { console.error('Missing POSTGRES_URL_NON_POOLING env var'); process.exit(1); }
if (!fs.existsSync(CACHE_ROOT)) { console.error(`Cache root not found: ${CACHE_ROOT}`); process.exit(1); }

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else { out[key] = true; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const dryRun = args['dry-run'] === true;
const limit = Number(args.limit ?? 0) || 0; // 0 = no cap
const concurrency = Math.max(1, Math.min(16, Number(args.concurrency ?? 4) || 4));

async function fetchTargets(): Promise<Array<{ id: string; doc_type: string; doc_number: string; source_hash: string; extracted_address: string | null }>> {
  const sql = postgres(DB_URL!, { prepare: false, max: 1 });
  try {
    // Same predicate the reconciler skips on: a later row exists at the same
    // r2_key with a different source_hash. Order by received_at so oldest
    // (longest-stranded) docs get restored first.
    // Restrict to stale-DIVERGENT only (also have different extracted_*
    // than the latest row at the same r2_key). Stale-identical rows still
    // have a PDF in R2 that describes the same job they expect (the bytes
    // drift but the content matches), so we can tolerate them without
    // restoration once we know they're identical.
    return (await sql`
      SELECT d.id::text, d.doc_type, d.doc_number, d.source_hash,
             d.extracted_address
      FROM bids.hubbell_documents d
      WHERE d.r2_key IS NOT NULL
        AND d.source_hash IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM bids.hubbell_documents d2
          WHERE d2.r2_key = d.r2_key
            AND d2.received_at > d.received_at
            AND d2.source_hash IS DISTINCT FROM d.source_hash
            AND (d2.extracted_address IS DISTINCT FROM d.extracted_address
              OR d2.extracted_total IS DISTINCT FROM d.extracted_total)
        )
      ORDER BY d.received_at ASC
      ${limit > 0 ? sql`LIMIT ${limit}` : sql``}
    `) as unknown as Array<{ id: string; doc_type: string; doc_number: string; source_hash: string; extracted_address: string | null }>;
  } finally {
    await sql.end();
  }
}

// Walk the cache root and yield every .pdf path. The cache mixes several
// shapes (hubbell_runs/*/pdfs/, hubbell_checks_out/pdfs/, hubbell_inbox/.../pdfs/);
// we don't try to parse filenames — sha256(bytes) is the only match key.
function* walkPdfs(root: string): Generator<string> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { continue; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && p.toLowerCase().endsWith('.pdf')) yield p;
    }
  }
}

async function indexLocalPdfs(): Promise<Map<string, string>> {
  console.log(`Indexing local PDFs under ${CACHE_ROOT} …`);
  const t0 = Date.now();
  const idx = new Map<string, string>();
  let count = 0;
  for (const p of walkPdfs(CACHE_ROOT)) {
    count++;
    try {
      const bytes = fs.readFileSync(p);
      const h = crypto.createHash('sha256').update(bytes).digest('hex');
      // Keep the first occurrence; later duplicates of identical PDFs are
      // expected (a PDF can appear in multiple run directories).
      if (!idx.has(h)) idx.set(h, p);
    } catch (err) {
      console.warn(`  ! read failed: ${p} — ${(err as Error).message}`);
    }
    if (count % 500 === 0) process.stdout.write(`  …${count} files hashed\r`);
  }
  console.log(`Indexed ${count} PDFs, ${idx.size} distinct hashes in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  return idx;
}

interface BackfillResult {
  document_id: string;
  status: 'restored' | 'already_correct' | 'not_found_locally' | 'error';
  detail?: string;
  pdf_path?: string;
}

async function postBackfill(documentId: string, pdfPath: string): Promise<BackfillResult> {
  const form = new FormData();
  form.set('document_id', documentId);
  const blob = new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' });
  form.set('pdf', blob, path.basename(pdfPath));
  const res = await fetch(`${BASE_URL}/api/admin/hubbell/backfill`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  let body: { status?: string; error?: string } = {};
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    return { document_id: documentId, status: 'error', detail: `HTTP ${res.status} ${body.error ?? ''}`, pdf_path: pdfPath };
  }
  if (body.status === 'restored' || body.status === 'already_correct') {
    return { document_id: documentId, status: body.status, pdf_path: pdfPath };
  }
  return { document_id: documentId, status: 'error', detail: `unexpected response ${JSON.stringify(body)}`, pdf_path: pdfPath };
}

async function main() {
  const targets = await fetchTargets();
  console.log(`Targets: ${targets.length} stale-divergent rows.`);
  if (targets.length === 0) { console.log('Nothing to restore.'); return; }

  const idx = await indexLocalPdfs();

  const results: BackfillResult[] = [];
  let nextIdx = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= targets.length) return;
      const t = targets[i];
      const localPath = idx.get(t.source_hash);
      if (!localPath) {
        results.push({ document_id: t.id, status: 'not_found_locally', detail: `hash=${t.source_hash.slice(0, 12)} doc=${t.doc_type}/${t.doc_number}` });
        continue;
      }
      if (dryRun) {
        results.push({ document_id: t.id, status: 'restored', detail: '(dry-run)', pdf_path: localPath });
        continue;
      }
      try {
        const r = await postBackfill(t.id, localPath);
        results.push(r);
      } catch (err) {
        results.push({ document_id: t.id, status: 'error', detail: (err as Error).message, pdf_path: localPath });
      }
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const restored = results.filter((r) => r.status === 'restored').length;
  const already = results.filter((r) => r.status === 'already_correct').length;
  const notFound = results.filter((r) => r.status === 'not_found_locally').length;
  const errored = results.filter((r) => r.status === 'error').length;

  console.log(`\nDone.`);
  console.log(`  restored:            ${restored}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`  already_correct:     ${already}`);
  console.log(`  not_found_locally:   ${notFound}`);
  console.log(`  errored:             ${errored}`);
  if (notFound > 0) {
    const sample = results.filter((r) => r.status === 'not_found_locally').slice(0, 5);
    console.log(`\nSample missing (PDFs not in local cache):`);
    for (const r of sample) console.log(`  - ${r.document_id}  ${r.detail ?? ''}`);
  }
  if (errored > 0) {
    const sample = results.filter((r) => r.status === 'error').slice(0, 5);
    console.log(`\nSample errors:`);
    for (const r of sample) console.log(`  - ${r.document_id}  ${r.detail ?? ''}`);
  }
}

main().catch((err) => { console.error('Restore failed:', err); process.exit(1); });
