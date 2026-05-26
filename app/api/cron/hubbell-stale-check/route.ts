// GET /api/cron/hubbell-stale-check
// Fires daily; emits a server log when no Hubbell documents have arrived
// in the last 36 hours (i.e. the local scrape job has likely failed).
//
// Schedule via vercel.json. Auth via CRON_SECRET bearer.

import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { verifyCronSignature } from '../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../db/index';

export const runtime = 'nodejs';

const STALE_HOURS = 36;

export async function GET(req: NextRequest) {
  const authError = verifyCronSignature(req);
  if (authError) return authError;

  const db = getDb();
  const latest = await db
    .select({ receivedAt: schema.hubbellDocuments.receivedAt })
    .from(schema.hubbellDocuments)
    .orderBy(desc(schema.hubbellDocuments.receivedAt))
    .limit(1);

  if (latest.length === 0) {
    console.warn('[hubbell-stale-check] no documents in table');
    return NextResponse.json({ stale: true, reason: 'no_documents', last_received_at: null });
  }

  const lastAt = new Date(latest[0].receivedAt);
  const ageHours = (Date.now() - lastAt.getTime()) / 36e5;
  const stale = ageHours > STALE_HOURS;

  if (stale) {
    console.warn(`[hubbell-stale-check] stale: last doc received ${ageHours.toFixed(1)}h ago at ${lastAt.toISOString()}`);
  }

  return NextResponse.json({
    stale,
    last_received_at: lastAt.toISOString(),
    age_hours: Number(ageHours.toFixed(1)),
    threshold_hours: STALE_HOURS,
  });
}
