import { NextRequest, NextResponse } from 'next/server';
import { getErpSql } from '../../../../db/supabase';
import {
  runGeocodeBatch,
  loadOpenAddresses,
  DEFAULT_IA_JOB_ID,
} from '../../../../src/lib/geocode-runner';
import { processNotification } from '../../../../src/lib/notifications';
import { verifyCronSignature } from '../../../../src/lib/service-auth';

export const maxDuration = 300;

// GET /api/cron/geocode-nightly
// Vercel cron — runs once a night, well before any users are online. Each
// invocation is sized to fit comfortably under Vercel's 5-minute window.
//
// Steps per run:
//   1. If geocode_index has no IA rows, OR the most recent OA row is >28 days
//      old, fetch the OpenAddresses IA statewide source. Soft-stops at 180s
//      to leave room for the geocode pass.
//   2. Run geocode batches of 500 against agility_customers until either:
//        - the queue is empty, OR
//        - we've used 60s of budget, OR
//        - 2 consecutive batches matched 0 (rest is presumably outside index)
//   3. Send a `geocode_nightly_summary` notification with the results.
//   4. On any thrown error, send a `geocode_nightly_error` notification.
//
// Subscribe to either eventType in /admin/notifications to receive emails.

const TOTAL_BUDGET_MS  = 270_000; // hard cap below Vercel's 300s
const OA_BUDGET_MS     = 180_000;
const GEO_BUDGET_MS    = 60_000;
const OA_REFRESH_DAYS  = 28;

interface NightlyResult {
  started_at: string;
  oa_refresh: {
    ran: boolean;
    reason: string;
    inserted?: number;
    parsed?: number;
    skipped?: number;
    elapsed_ms?: number;
    error?: string;
  };
  geocode: {
    batches: number;
    attempted: number;
    matched: number;
    remaining: number;
    elapsed_ms: number;
    stop_reason: string;
    error?: string;
  };
  total_elapsed_ms: number;
}

// DISABLED 2026-05-18. Geocoding consolidated on the Pi (agility-api-sync)
// to avoid running two matchers against the same rows and to free the
// ~666 MB `public.geocode_index` table that Supabase was hosting. The Pi
// uses agility_api/geocoder_sqlite.py with a local SQLite parcel index.
// Re-enabling this route requires:
//   1. Recreating public.geocode_index (db/migrations/0014).
//   2. Reloading source data (loadOpenAddresses + scripts/load-*-into-index).
//   3. Re-adding the cron entry to vercel.json.
// Until then, this endpoint is a no-op stub.
export async function GET(req: NextRequest) {
  const authError = verifyCronSignature(req);
  if (authError) return authError;
  return NextResponse.json({
    disabled: true,
    reason: 'Geocoding moved to Pi (agility-api-sync). See route header for re-enable steps.',
  });
}

async function _disabled_GET(req: NextRequest) {
  void req;
  const startedAt = new Date();
  const startMs = Date.now();
  const result: NightlyResult = {
    started_at: startedAt.toISOString(),
    oa_refresh: { ran: false, reason: '' },
    geocode: { batches: 0, attempted: 0, matched: 0, remaining: 0, elapsed_ms: 0, stop_reason: '' },
    total_elapsed_ms: 0,
  };

  try {
    const sql = getErpSql();

    // ── OpenAddresses refresh check ─────────────────────────────────────────
    const [{ latest, ia_rows }] = await sql<{ latest: string | null; ia_rows: number }[]>`
      SELECT MAX(loaded_at)::text AS latest,
             COUNT(*) FILTER (WHERE state_norm = 'IA')::int AS ia_rows
      FROM public.geocode_index
    `;

    const ageDays = latest ? (Date.now() - new Date(latest).getTime()) / 86_400_000 : Infinity;
    const shouldRefresh = ia_rows === 0 || ageDays >= OA_REFRESH_DAYS;

    if (shouldRefresh) {
      result.oa_refresh.ran = true;
      result.oa_refresh.reason = ia_rows === 0
        ? 'index empty'
        : `latest row is ${ageDays.toFixed(1)} days old (>= ${OA_REFRESH_DAYS})`;
      try {
        const oa = await loadOpenAddresses(sql, {
          jobId: DEFAULT_IA_JOB_ID,
          state: 'IA',
          deadlineMs: OA_BUDGET_MS,
        });
        result.oa_refresh.inserted = oa.inserted;
        result.oa_refresh.parsed = oa.parsed;
        result.oa_refresh.skipped = oa.skipped;
        result.oa_refresh.elapsed_ms = oa.elapsed_ms;
      } catch (err) {
        result.oa_refresh.error = err instanceof Error ? err.message : String(err);
      }
    } else {
      result.oa_refresh.reason = `index is ${ageDays.toFixed(1)} days old, skipping refresh`;
    }

    // ── Geocode pass ────────────────────────────────────────────────────────
    const geoStart = Date.now();
    const geoDeadline = Math.min(startMs + TOTAL_BUDGET_MS, geoStart + GEO_BUDGET_MS);
    let consecutiveNoProgress = 0;

    while (Date.now() < geoDeadline) {
      let batch;
      try {
        batch = await runGeocodeBatch(sql, { state: 'IA', batchSize: 500 });
      } catch (err) {
        result.geocode.error = err instanceof Error ? err.message : String(err);
        result.geocode.stop_reason = 'error';
        break;
      }
      result.geocode.batches += 1;
      result.geocode.attempted += batch.attempted;
      result.geocode.matched += batch.matched_city + batch.matched_zip + batch.matched_state_unique;
      result.geocode.remaining = batch.remaining_failed;

      if (batch.attempted === 0 || batch.remaining_failed === 0) {
        result.geocode.stop_reason = 'queue empty';
        break;
      }
      const matchedThisBatch = batch.matched_city + batch.matched_zip + batch.matched_state_unique;
      if (matchedThisBatch === 0) {
        consecutiveNoProgress += 1;
        // Higher threshold (was 5) — even with the start-with-digit filter,
        // the queue can include long runs of legitimate-looking addresses
        // that aren't in OA / county atlases (new subdivisions, etc.).
        // 10 batches × 500 rows = 5,000 attempts before we give up.
        if (consecutiveNoProgress >= 10) {
          result.geocode.stop_reason = 'no progress (likely missing from index)';
          break;
        }
      } else {
        consecutiveNoProgress = 0;
      }
    }
    if (!result.geocode.stop_reason) result.geocode.stop_reason = 'time budget exhausted';
    result.geocode.elapsed_ms = Date.now() - geoStart;
    result.total_elapsed_ms = Date.now() - startMs;

    // ── Notifications ──────────────────────────────────────────────────────
    const hasError = !!result.oa_refresh.error || !!result.geocode.error;
    await processNotification({
      eventType: hasError ? 'geocode_nightly_error' : 'geocode_nightly_summary',
      details: {
        projectName: 'Geocode Nightly',
        ...result,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/geocode-nightly]', err);
    const message = err instanceof Error ? err.message : String(err);
    result.total_elapsed_ms = Date.now() - startMs;
    await processNotification({
      eventType: 'geocode_nightly_error',
      details: { projectName: 'Geocode Nightly', fatal_error: message, ...result },
    }).catch(() => {});
    return NextResponse.json({ error: 'Cron run failed', detail: message, partial: result }, { status: 500 });
  }
}
