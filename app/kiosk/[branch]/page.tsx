import { redirect } from 'next/navigation';
import KioskPickersClient from './KioskPickersClient';
import { getErpSql } from '../../../db/supabase';

const VALID_BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

export default async function KioskPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  const b = branch.toUpperCase();
  if (!VALID_BRANCHES.includes(b)) redirect('/');

  let initialPickers: { id: number; name: string; user_type: string | null; branch_code: string | null }[] = [];
  try {
    const sql = getErpSql();
    initialPickers = await sql<typeof initialPickers>`
      SELECT id, name, user_type, branch_code
      FROM pickster
      WHERE branch_code = ${b}
      ORDER BY name
    `;
  } catch {
    // Fall back to client-side fetch if DB is unavailable at render time
  }

  return <KioskPickersClient branch={b} initialPickers={initialPickers} />;
}
