import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { isAgilityConfigured } from '../../../../../src/lib/agility-api';

/**
 * GET /api/admin/agility/status
 *
 * Returns Agility API configuration status without making a live API call.
 * Safe to call frequently — no network calls to Agility.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const configured = isAgilityConfigured();

  return NextResponse.json({
    configured,
    envVars: {
      AGILITY_API_URL: !!process.env.AGILITY_API_URL,
      AGILITY_USERNAME: !!process.env.AGILITY_USERNAME,
      AGILITY_PASSWORD: !!process.env.AGILITY_PASSWORD,
      AGILITY_BRANCH: process.env.AGILITY_BRANCH ?? '(not set — will use login default)',
    },
    note: configured
      ? 'Agility API is configured. Use /api/admin/agility/test to verify connectivity.'
      : 'Set AGILITY_API_URL, AGILITY_USERNAME, and AGILITY_PASSWORD to enable the Agility API.',
  });
}
