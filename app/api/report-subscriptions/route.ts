import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { auth } from '../../../auth';
import { hasCapability } from '../../../src/lib/access-control';
import { getDb } from '../../../db/index';
import { reportSubscriptions } from '../../../db/schema';
import { REPORT_KEYS, getReport, validateParams } from '../../../src/lib/reports/registry';
import { computeNextRunAt } from '../../../src/lib/reports/schedule';

const createSchema = z.object({
  reportKey: z.enum(REPORT_KEYS),
  params:    z.unknown().optional(),
  cadence:   z.enum(['daily', 'weekly', 'monthly']),
  sendDow:   z.number().int().min(1).max(7).nullable().optional(),
  sendDom:   z.number().int().min(1).max(28).nullable().optional(),
  sendHour:  z.number().int().min(0).max(23).default(7),
  timezone:  z.string().min(1).max(64).default('America/Chicago'),
  format:    z.enum(['pdf', 'excel']),
});

function userIdFromSession(session: Session | null): number | null {
  if (!session?.user?.id) return null;
  const parsed = parseInt(session.user.id, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// GET /api/report-subscriptions — list current user's subscriptions
export async function GET() {
  const session = (await auth()) as Session | null;
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = userIdFromSession(session);
  if (userId === null) return NextResponse.json({ error: 'Invalid session' }, { status: 400 });

  const db = getDb();
  const rows = await db
    .select()
    .from(reportSubscriptions)
    .where(eq(reportSubscriptions.userId, userId))
    .orderBy(desc(reportSubscriptions.createdAt));

  return NextResponse.json({ subscriptions: rows });
}

// POST /api/report-subscriptions — create a subscription for the current user
export async function POST(req: NextRequest) {
  const session = (await auth()) as Session | null;
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = userIdFromSession(session);
  const email = session.user.email;
  if (userId === null || !email) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const report = getReport(input.reportKey);
  if (!report) return NextResponse.json({ error: 'Unknown report' }, { status: 400 });

  // Capability gate — same as the underlying report page.
  if (!hasCapability(session, report.capability)) {
    return NextResponse.json({ error: `Missing capability: ${report.capability}` }, { status: 403 });
  }

  // Validate params against the report's schema. The schema coerces / defaults
  // so we store a normalized snapshot rather than raw user input.
  let normalizedParams: unknown;
  try {
    normalizedParams = validateParams(input.reportKey, input.params ?? {});
  } catch (err) {
    return NextResponse.json({
      error: 'Invalid report params',
      details: err instanceof Error ? err.message : String(err),
    }, { status: 400 });
  }

  // Cadence sanity: weekly needs sendDow, monthly needs sendDom.
  if (input.cadence === 'weekly' && (input.sendDow === null || input.sendDow === undefined)) {
    return NextResponse.json({ error: 'sendDow required for weekly cadence' }, { status: 400 });
  }
  if (input.cadence === 'monthly' && (input.sendDom === null || input.sendDom === undefined)) {
    return NextResponse.json({ error: 'sendDom required for monthly cadence' }, { status: 400 });
  }

  const now = new Date();
  const nextRunAt = computeNextRunAt(
    {
      cadence:  input.cadence,
      sendDow:  input.sendDow ?? null,
      sendDom:  input.sendDom ?? null,
      sendHour: input.sendHour,
      timezone: input.timezone,
    },
    now,
  );

  const db = getDb();
  const inserted = await db
    .insert(reportSubscriptions)
    .values({
      userId,
      email,
      reportKey: input.reportKey,
      params:    normalizedParams as Record<string, unknown>,
      cadence:   input.cadence,
      sendDow:   input.cadence === 'weekly'  ? input.sendDow ?? null : null,
      sendDom:   input.cadence === 'monthly' ? input.sendDom ?? null : null,
      sendHour:  input.sendHour,
      timezone:  input.timezone,
      format:    input.format,
      isActive:  true,
      nextRunAt,
    })
    .returning();

  return NextResponse.json({ subscription: inserted[0] }, { status: 201 });
}
