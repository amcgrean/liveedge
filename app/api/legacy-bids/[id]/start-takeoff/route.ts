/**
 * POST /api/legacy-bids/:id/start-takeoff
 *
 * Creates a new takeoff session linked to a legacy bid.
 * - Upserts a `bids` record (UUID table) with spec flags + customer info
 *   from the legacy bid so the takeoff module has context.
 * - Creates a `takeoff_sessions` row referencing both the UUID bids.id
 *   and the integer legacy_bid_id.
 * - Inserts all standard measurement preset groups.
 * - Returns { sessionId } for redirect to /takeoff/:sessionId
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb, schema } from '../../../../../db/index';
import {
  legacyBid,
  legacyCustomer,
  legacyBranch,
  legacyEstimator,
} from '../../../../../db/schema-legacy';
import { eq, and, desc } from 'drizzle-orm';
import { STANDARD_PRESETS } from '@/lib/takeoff/presets';
import { legacyBidFile } from '../../../../../db/schema-legacy';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const legacyBidId = parseInt(id, 10);
  if (isNaN(legacyBidId)) {
    return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });
  }

  let body: { sessionName?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  try {
    const db = getDb();

    // Fetch legacy bid with customer + branch + estimator
    const rows = await db
      .select({
        bid: legacyBid,
        customerName: legacyCustomer.name,
        customerCode: legacyCustomer.customerCode,
        branchCode: legacyBranch.branchCode,
        estimatorName: legacyEstimator.estimatorName,
      })
      .from(legacyBid)
      .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
      .leftJoin(legacyBranch, eq(legacyBid.branchId, legacyBranch.branchId))
      .leftJoin(legacyEstimator, eq(legacyBid.estimatorId, legacyEstimator.estimatorID))
      .where(eq(legacyBid.id, legacyBidId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const { bid, customerName, customerCode, branchCode, estimatorName } = rows[0];

    // Check for an existing takeoff session already linked to this legacy bid
    const existing = await db
      .select({ id: schema.takeoffSessions.id })
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.legacyBidId, legacyBidId))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        sessionId: existing[0].id,
        alreadyExists: true,
      });
    }

    // Build a bids record pre-populated with legacy bid context.
    // The `inputs` JSONB carries a `specsIncluded` block that the takeoff module
    // can use to show only the relevant measurement preset categories.
    const specsIncluded = {
      framing: bid.includeFraming ?? false,
      siding: bid.includeSiding ?? false,
      shingle: bid.includeShingle ?? false,
      deck: bid.includeDeck ?? false,
      trim: bid.includeTrim ?? false,
      windows: bid.includeWindow ?? false,
      doors: bid.includeDoor ?? false,
    };

    // Upsert bids record (in case one already exists for this legacy bid — edge case)
    const [uuidBid] = await db
      .insert(schema.bids)
      .values({
        jobName: bid.projectName,
        customerCode: customerCode ?? undefined,
        customerName: customerName ?? undefined,
        estimatorName: estimatorName ?? session.user.name ?? 'Unknown',
        branch: branchCode ?? 'grimes',
        status: 'draft',
        inputs: {
          setup: {
            jobName: bid.projectName,
            customerName: customerName ?? '',
            customerCode: customerCode ?? '',
            branch: branchCode ?? 'grimes',
            estimatorName: estimatorName ?? session.user.name ?? '',
          },
          specsIncluded,
          planType: bid.planType,
        },
      })
      .returning();

    // Create the takeoff session linked to both
    const sessionName =
      body.sessionName?.trim() ||
      `${bid.projectName} — ${customerName ?? 'Customer'} (Bid #${legacyBidId})`;

    // Look up the most recent PDF file attached to this bid in R2
    const pdfFiles = await db
      .select()
      .from(legacyBidFile)
      .where(eq(legacyBidFile.bidId, legacyBidId))
      .orderBy(desc(legacyBidFile.uploadedAt));

    const planFile = pdfFiles.find(
      (f) =>
        f.fileType?.includes('pdf') ||
        f.filename.toLowerCase().endsWith('.pdf')
    ) ?? null;

    const [takeoffSession] = await db
      .insert(schema.takeoffSessions)
      .values({
        bidId: uuidBid.id,
        legacyBidId,
        name: sessionName,
        pdfFileName: planFile?.filename ?? bid.planFilename ?? '',
        pdfStorageKey: planFile?.fileKey ?? null,
        pageCount: 0,
      })
      .returning();

    // Create standard preset groups — filter by specsIncluded so only
    // relevant categories appear by default (estimators can always add more).
    const activeCategories = new Set<string>();
    if (specsIncluded.framing) activeCategories.add('Basement');
    if (specsIncluded.framing) activeCategories.add('1st Floor');
    if (specsIncluded.framing) activeCategories.add('2nd Floor');
    if (specsIncluded.framing) activeCategories.add('Roof');
    if (specsIncluded.framing) activeCategories.add('General');
    if (specsIncluded.deck)    activeCategories.add('Deck');
    if (specsIncluded.siding)  activeCategories.add('Siding');
    if (specsIncluded.trim)    activeCategories.add('Trim');
    if (specsIncluded.windows) activeCategories.add('Windows');
    if (specsIncluded.doors)   activeCategories.add('Doors');
    if (specsIncluded.shingle) activeCategories.add('Roofing');

    // If no specs selected, load ALL presets (standalone/generic takeoff)
    const filteredPresets =
      activeCategories.size > 0
        ? STANDARD_PRESETS.filter((p) => !p.category || activeCategories.has(p.category))
        : STANDARD_PRESETS;

    if (filteredPresets.length > 0) {
      await db.insert(schema.takeoffGroups).values(
        filteredPresets.map((preset, idx) => ({
          sessionId: takeoffSession.id,
          name: preset.name,
          color: preset.color,
          type: preset.toolType,
          unit: preset.unit,
          sortOrder: idx,
          targetField: preset.targetField,
          isPreset: true,
          category: preset.category,
        }))
      );
    }

    return NextResponse.json({
      sessionId: takeoffSession.id,
      pdfPreloaded: !!planFile,
    }, { status: 201 });
  } catch (err) {
    console.error('[start-takeoff]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────
// GET /api/legacy-bids/:id/start-takeoff
// Check if a takeoff session already exists for this bid
// ──────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const legacyBidId = parseInt(id, 10);
  if (isNaN(legacyBidId)) {
    return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });
  }

  try {
    const db = getDb();
    const existing = await db
      .select({ id: schema.takeoffSessions.id, name: schema.takeoffSessions.name })
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.legacyBidId, legacyBidId))
      .limit(1);

    return NextResponse.json({
      exists: existing.length > 0,
      session: existing[0] ?? null,
    });
  } catch (err) {
    console.error('[start-takeoff GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
