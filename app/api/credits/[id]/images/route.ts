import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

export interface CreditImage {
  id: number;
  filename: string;
  email_from: string | null;
  email_subject: string | null;
  received_at: string | null;
  has_file: boolean;
  link_url: string | null;
}

// GET /api/credits/[id]/images
// Lists all credit_images rows for the given SO/CM number.
// [id] is the SO ID (e.g. "100001"), not a credit_images row ID.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const sql = getErpSql();

    type Row = {
      id: number;
      filename: string;
      filepath: string | null;
      email_from: string | null;
      email_subject: string | null;
      received_at: string | null;
      r2_key: string | null;
    };

    const rows = await sql<Row[]>`
      SELECT id, filename, filepath, email_from, email_subject, received_at::text AS received_at, r2_key
      FROM credit_images
      WHERE rma_number = ${id}
      ORDER BY received_at DESC NULLS LAST
    `;

    const images: CreditImage[] = rows.map((r) => {
      const hasFile = !!r.r2_key;
      // When there's no R2 file but `filepath` holds an http(s) URL, this row is a
      // captured share link (Dropbox / WeTransfer / Drive / etc.) — surface as link.
      const linkUrl = !hasFile && r.filepath && /^https?:\/\//i.test(r.filepath)
        ? r.filepath
        : null;
      return {
        id: r.id,
        filename: r.filename,
        email_from: r.email_from,
        email_subject: r.email_subject,
        received_at: r.received_at,
        has_file: hasFile,
        link_url: linkUrl,
      };
    });

    return NextResponse.json({ images });
  } catch (err) {
    console.error('[credits/images GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
