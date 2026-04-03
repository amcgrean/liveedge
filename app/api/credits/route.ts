import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getErpSql } from '../../../db/supabase';

// GET /api/credits?rma=&q=&limit=50
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const rma = (searchParams.get('rma') ?? '').trim().toUpperCase();
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10) || 50);

  if (!rma && q.length < 2) {
    return NextResponse.json({ credits: [] });
  }

  try {
    const sql = getErpSql();

    type Row = {
      id: number; rma_number: string; filename: string; filepath: string;
      email_from: string | null; email_subject: string | null;
      received_at: string | null; uploaded_at: string | null;
      r2_key: string | null;
    };

    const rows = rma
      ? await sql<Row[]>`
          SELECT id, rma_number, filename, filepath, email_from, email_subject,
                 received_at::text, uploaded_at::text, r2_key
          FROM credit_images
          WHERE rma_number ILIKE ${rma + '%'}
          ORDER BY received_at DESC
          LIMIT ${limit}
        `
      : await sql<Row[]>`
          SELECT id, rma_number, filename, filepath, email_from, email_subject,
                 received_at::text, uploaded_at::text, r2_key
          FROM credit_images
          WHERE rma_number ILIKE ${'%' + q + '%'}
             OR email_from ILIKE ${'%' + q + '%'}
             OR email_subject ILIKE ${'%' + q + '%'}
          ORDER BY received_at DESC
          LIMIT ${limit}
        `;

    // Group by RMA number
    const grouped = rows.reduce<Record<string, { rma_number: string; images: Row[] }>>((acc, row) => {
      if (!acc[row.rma_number]) {
        acc[row.rma_number] = { rma_number: row.rma_number, images: [] };
      }
      acc[row.rma_number].images.push(row);
      return acc;
    }, {});

    return NextResponse.json({ credits: Object.values(grouped), total: rows.length });
  } catch (err) {
    console.error('[credits GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
