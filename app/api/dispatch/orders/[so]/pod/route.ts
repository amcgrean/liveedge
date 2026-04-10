import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../../src/lib/agility-api';

/**
 * POST /api/dispatch/orders/:so/pod
 *
 * Records a proof-of-delivery signature in the Agility ERP.
 * Called by the dispatch board or driver app when a delivery is confirmed.
 *
 * Body:
 *   branchCode:    string  — e.g. '20GR'
 *   shipmentNum:   number  — shipment number on the SO (usually 1)
 *   signerName:    string  — name of person who signed
 *   signatureData: string  — base64-encoded PNG of the signature
 *   signatureDate?: string — yyyy-mm-dd (defaults to today)
 */

type RouteContext = { params: Promise<{ so: string }> };

interface PodBody {
  branchCode: string;
  shipmentNum: number;
  signerName: string;
  signatureData: string;
  signatureDate?: string;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  const { so: soNumber } = await context.params;

  let body: PodBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.branchCode || !body.signerName || !body.signatureData) {
    return NextResponse.json(
      { error: 'branchCode, signerName, and signatureData are required' },
      { status: 400 }
    );
  }

  if (!body.signatureData.startsWith('data:image/') && !body.signatureData.match(/^[A-Za-z0-9+/]+=*$/)) {
    return NextResponse.json(
      { error: 'signatureData must be a base64 image string or data URI' },
      { status: 400 }
    );
  }

  // Strip data URI prefix if present — Agility expects raw base64
  const base64 = body.signatureData.replace(/^data:image\/[a-z]+;base64,/, '');

  const today = new Date().toISOString().slice(0, 10);
  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;

  try {
    await agilityApi.podSignatureCreate(
      {
        OrderID:       soNumber,
        ShipmentNum:   body.shipmentNum ?? 1,
        SignatureName: body.signerName,
        SignatureData: base64,
        SignatureDate: body.signatureDate ?? today,
      },
      { branch: agilityBranch }
    );

    return NextResponse.json({
      success:  true,
      soNumber,
      message:  `POD signature recorded for SO ${soNumber}, signed by ${body.signerName}`,
    });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility: ${err.message}` }, { status: 422 });
    }
    console.error(`[dispatch/orders/${soNumber}/pod POST]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
