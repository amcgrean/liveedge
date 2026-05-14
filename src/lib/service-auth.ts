import { NextRequest, NextResponse } from 'next/server';

export function verifyCronSignature(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
  }

  const vercelCron = req.headers.get('x-vercel-cron');
  if (!vercelCron) {
    return NextResponse.json({ error: 'Missing CRON_SECRET or Vercel cron header' }, { status: 401 });
  }

  return null;
}

export function verifyInternalToken(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'INTERNAL_API_TOKEN not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
