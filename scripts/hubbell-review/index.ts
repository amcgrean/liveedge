#!/usr/bin/env tsx
/* eslint-disable no-console */
// Hubbell Review CLI — see README.md in this directory for usage.
//
// Pulls pending Hubbell-doc → Agility-SO match suggestions to a local work
// directory, lets any agent (Codex, Claude Code, etc.) review them by reading
// the PDFs and writing per-packet decision files, then POSTs the decisions
// back to LiveEdge.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = (process.env.LIVEEDGE_BASE_URL ?? 'https://app.beisser.cloud').replace(/\/$/, '');
const TOKEN = process.env.LIVEEDGE_HUBBELL_TOKEN;

if (!TOKEN) {
  console.error('Missing LIVEEDGE_HUBBELL_TOKEN env var. See README.md.');
  process.exit(1);
}

type Suggestion = {
  id: string;
  document_id: string;
  so_id: number;
  cust_code: string | null;
  match_source: string;
  confidence: number;
  match_reasons: string[];
  status: string;
  doc: {
    doc_type: string;
    doc_number: string;
    extracted_address: string | null;
    extracted_city: string | null;
    extracted_state: string | null;
    extracted_zip: string | null;
    extracted_total: number | null;
    dev_code: string | null;
    house_number: string | null;
    scrape_cust_code: string | null;
    scrape_seq_num: string | null;
    match_status: string;
  };
  so: {
    cust_code: string | null;
    cust_name: string | null;
    reference: string | null;
    po_number: string | null;
    shipto_address: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
    so_status: string | null;
    expect_date: string | null;
    order_total: number | null;
  };
};

type Packet = {
  document_id: string;
  doc: Suggestion['doc'];
  candidates: Array<{
    suggestion_id: string;
    so_id: number;
    confidence: number;
    match_source: string;
    match_reasons: string[];
    so: Suggestion['so'];
  }>;
};

type Decision = {
  suggestion_id: string;
  action: 'accept' | 'reject' | 'skip';
  confidence?: 'high' | 'medium' | 'low';
  // Training-corpus fields — forwarded to the review endpoint, which persists
  // them to bids.hubbell_match_labels. See REVIEW.md / README.md.
  reason_code?: string;
  signals?: Record<string, boolean>;
  reasoning?: string;
};

type DecisionsFile = {
  decisions: Decision[];
};

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${TOKEN}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(url, { ...init, headers });
}

// ────────────────────────── pull ──────────────────────────────────────────

async function cmdPull(args: Record<string, string | true>): Promise<void> {
  const limit = Number(args.limit ?? 10);
  const minConfidence = Number(args['min-confidence'] ?? 30);
  const dir = String(args.dir ?? './hubbell-queue');
  const packetsDir = path.join(dir, 'packets');
  fs.mkdirSync(packetsDir, { recursive: true });

  // Pull more than `limit` suggestions because we group by doc — one doc can
  // produce many suggestions. Multiplier is 2x: empirically ~6 candidates/doc
  // on the live data, so 2x is enough headroom to fill `limit` unique docs.
  // Higher multipliers push the suggestions endpoint into a slow path
  // (the agility_so_header lookup at large IN-list sizes — no functional
  // index on so_id::int on the ERP side). Cap absolute request at 200.
  const fetchLimit = Math.min(200, Math.max(20, limit * 2));
  const source = typeof args.source === 'string' ? args.source : undefined;
  const sourceParam = source ? `&match_source=${encodeURIComponent(source)}` : '';
  const url = `/api/admin/hubbell/suggestions?status=pending&min_confidence=${minConfidence}&limit=${fetchLimit}${sourceParam}`;
  console.log(`Fetching pending suggestions from ${BASE_URL}${url} …`);
  const res = await api(url);
  if (!res.ok) {
    console.error(`Suggestions GET failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = (await res.json()) as { suggestions: Suggestion[]; total: number };
  console.log(`  ${body.suggestions.length} suggestions returned (${body.total} total pending).`);

  // Group by doc.
  const byDoc = new Map<string, Suggestion[]>();
  for (const s of body.suggestions) {
    const arr = byDoc.get(s.document_id) ?? [];
    arr.push(s);
    byDoc.set(s.document_id, arr);
  }

  const appliedDir = path.join(dir, 'applied');
  let pulled = 0;
  let skipped = 0;
  for (const [docId, suggestions] of byDoc.entries()) {
    if (pulled >= limit) break;

    // Resolve a unique packet directory. The first pull for a doc lands at
    // packets/<doc_id>/. If a *prior* batch already processed this doc and
    // its decisions are in applied/<doc_id>/, the suggester can surface NEW
    // candidates on the same doc later (e.g. the prior batch all-rejected,
    // leaving the doc still 'unmatched', and a re-run brought in different
    // candidates). To avoid clobbering or collision, we append __pass2,
    // __pass3, etc. on subsequent pulls. Skip if the doc is still pending
    // local review (packetDir without a __passN suffix exists).
    let packetDir = path.join(packetsDir, docId);
    if (fs.existsSync(packetDir)) {
      // Doc is currently pending local review — don't clobber in-flight
      // decisions.json. Re-pull is intentional: skip.
      skipped++;
      continue;
    }
    if (fs.existsSync(path.join(appliedDir, docId))) {
      // Already-applied previously. The server is returning NEW pending
      // suggestions on this doc, so surface as a new packet under __passN.
      let attempt = 2;
      while (
        fs.existsSync(path.join(packetsDir, `${docId}__pass${attempt}`)) ||
        fs.existsSync(path.join(appliedDir, `${docId}__pass${attempt}`))
      ) {
        attempt++;
      }
      packetDir = path.join(packetsDir, `${docId}__pass${attempt}`);
    }
    fs.mkdirSync(packetDir, { recursive: true });

    // 1) Fetch presigned PDF URL, then download.
    const pdfRes = await api(`/api/admin/hubbell/documents/${docId}/pdf`);
    if (!pdfRes.ok) {
      console.warn(`  ! pdf URL fetch failed for ${docId}: ${pdfRes.status}`);
      fs.rmSync(packetDir, { recursive: true, force: true });
      continue;
    }
    const { url: pdfUrl } = (await pdfRes.json()) as { url: string };
    const pdfBin = await fetch(pdfUrl);
    if (!pdfBin.ok) {
      console.warn(`  ! pdf download failed for ${docId}: ${pdfBin.status}`);
      fs.rmSync(packetDir, { recursive: true, force: true });
      continue;
    }
    const buf = Buffer.from(await pdfBin.arrayBuffer());
    fs.writeFileSync(path.join(packetDir, 'doc.pdf'), buf);

    // 2) Write packet.json.
    const packet: Packet = {
      document_id: docId,
      doc: suggestions[0].doc,
      candidates: suggestions.map((s) => ({
        suggestion_id: s.id,
        so_id: s.so_id,
        confidence: s.confidence,
        match_source: s.match_source,
        match_reasons: s.match_reasons,
        so: s.so,
      })),
    };
    fs.writeFileSync(path.join(packetDir, 'packet.json'), JSON.stringify(packet, null, 2));

    // 3) Write empty decisions template the agent fills in.
    const template: DecisionsFile = {
      decisions: suggestions.map((s) => ({
        suggestion_id: s.id,
        action: 'skip',
        confidence: 'low',
        reason_code: '(fill in: see README reason codes)',
        signals: { address: false, ref_match: false, dev_house: false, scope_phase: false, amount: false },
        reasoning: '(fill in)',
      })),
    };
    fs.writeFileSync(path.join(packetDir, 'decisions.json'), JSON.stringify(template, null, 2));

    const packetName = path.basename(packetDir);
    const passNote = packetName !== docId ? ' [re-pass — prior decisions already applied]' : '';
    console.log(
      `  + ${packetName}  (${packet.doc.doc_type.toUpperCase()} ${packet.doc.doc_number}, ${suggestions.length} candidate${suggestions.length === 1 ? '' : 's'})${passNote}`,
    );
    pulled++;
  }

  console.log(`\nPulled ${pulled} new packets (skipped ${skipped} already on disk).`);
  console.log(`Work dir: ${path.resolve(dir)}`);
  console.log('\nNext: have your agent fill in decisions.json for each packet, then run `apply`.');
}

// ────────────────────────── apply ─────────────────────────────────────────

async function cmdApply(args: Record<string, string | true>): Promise<void> {
  const dir = String(args.dir ?? './hubbell-queue');
  const reviewer = String(args.reviewer ?? 'codex');
  const dryRun = args['dry-run'] === true;
  const packetsDir = path.join(dir, 'packets');
  const appliedDir = path.join(dir, 'applied');
  if (!fs.existsSync(packetsDir)) {
    console.error(`No packets directory at ${packetsDir}. Run \`pull\` first.`);
    process.exit(1);
  }
  fs.mkdirSync(appliedDir, { recursive: true });

  const docDirs = fs.readdirSync(packetsDir).filter((f) => {
    return fs.statSync(path.join(packetsDir, f)).isDirectory();
  });

  let docsProcessed = 0;
  let accepted = 0;
  let rejected = 0;
  let skipped = 0;
  let unfilled = 0;
  const errors: Array<{ doc_id: string; suggestion_id?: string; error: string }> = [];

  for (const docId of docDirs) {
    const packetDir = path.join(packetsDir, docId);
    const decisionsPath = path.join(packetDir, 'decisions.json');
    if (!fs.existsSync(decisionsPath)) {
      unfilled++;
      continue;
    }
    let decisions: DecisionsFile;
    try {
      decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
    } catch (err) {
      errors.push({ doc_id: docId, error: `parse decisions.json: ${err}` });
      continue;
    }

    const hasFilled = decisions.decisions.some(
      (d) => d.action === 'accept' || d.action === 'reject',
    );
    if (!hasFilled) {
      // All skips — usually means the agent didn't touch this packet yet.
      unfilled++;
      continue;
    }

    let docOk = true;
    for (const d of decisions.decisions) {
      if (d.action !== 'accept' && d.action !== 'reject') {
        // Skip is a no-op on the server side (action must be accept|reject);
        // tally and move on.
        skipped++;
        continue;
      }
      if (dryRun) {
        console.log(
          `  [dry-run] ${docId} / ${d.suggestion_id}  →  ${d.action}${d.confidence ? ` (${d.confidence})` : ''}: ${d.reasoning ?? ''}`,
        );
        if (d.action === 'accept') accepted++;
        else rejected++;
        continue;
      }
      const res = await api(`/api/admin/hubbell/suggestions/${d.suggestion_id}/review`, {
        method: 'POST',
        headers: { 'X-Reviewer': reviewer },
        body: JSON.stringify({
          action: d.action,
          reason_code: d.reason_code,
          signals: d.signals,
          confidence: d.confidence,
          reasoning: d.reasoning,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        errors.push({ doc_id: docId, suggestion_id: d.suggestion_id, error: `${res.status} ${text}` });
        docOk = false;
        continue;
      }
      if (d.action === 'accept') accepted++;
      else rejected++;
    }

    if (docOk && !dryRun) {
      // Move processed packet out of the queue.
      const destDir = path.join(appliedDir, docId);
      fs.renameSync(packetDir, destDir);
      docsProcessed++;
    }
  }

  console.log(`\nApplied: ${docsProcessed} packets`);
  console.log(`  ${accepted} accepts, ${rejected} rejects, ${skipped} skip-no-ops`);
  console.log(`  ${unfilled} packets left unfilled (no accept/reject in decisions.json)`);
  if (errors.length > 0) {
    console.log(`\n${errors.length} errors:`);
    for (const e of errors) {
      console.log(`  ${e.doc_id}${e.suggestion_id ? ` / ${e.suggestion_id}` : ''}: ${e.error}`);
    }
  }
}

// ────────────────────────── main ──────────────────────────────────────────

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case 'pull':
      await cmdPull(args);
      break;
    case 'apply':
      await cmdApply(args);
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx scripts/hubbell-review pull --limit 10 [--dir ./hubbell-queue]');
      console.log('  npx tsx scripts/hubbell-review apply [--dir ./hubbell-queue] [--reviewer codex] [--dry-run]');
      console.log('\nSee scripts/hubbell-review/README.md for full instructions.');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
