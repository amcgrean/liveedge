import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/admin/app-users — list all OTP auth users
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const sql = getErpSql();
    const rows = await sql`
      SELECT id, email, display_name, user_id, phone, roles, branch, is_active,
             created_at::text, last_login_at::text
      FROM app_users
      ORDER BY display_name NULLS LAST, email
    `;
    return NextResponse.json({ users: rows });
  } catch (err) {
    console.error('[admin/app-users GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/app-users — upsert an OTP user by email (create or update display_name/roles)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    email?: string;
    display_name?: string;
    roles?: string[];
  };

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
  }

  const name = body.display_name?.trim() || null;
  const roles = Array.isArray(body.roles) ? body.roles : [];

  try {
    const sql = getErpSql();
    const [row] = await sql`
      INSERT INTO app_users (email, display_name, roles, branch, is_active)
      VALUES (${email}, ${name}, ${JSON.stringify(roles)}, null, true)
      ON CONFLICT (email) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        roles = EXCLUDED.roles,
        is_active = true
      RETURNING id, email, display_name, user_id, phone, roles, branch, is_active,
                created_at::text, last_login_at::text
    `;
    return NextResponse.json(row);
  } catch (err) {
    console.error('[admin/app-users PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/app-users — create a new OTP user
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    email?: string;
    display_name?: string;
    user_id?: string;
    phone?: string;
    roles?: string[];
    branch?: string;
    is_active?: boolean;
  };

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
  }

  const roles = Array.isArray(body.roles) ? body.roles : [];
  const isActive = body.is_active !== false;

  try {
    const sql = getErpSql();
    const [row] = await sql`
      INSERT INTO app_users (email, display_name, user_id, phone, roles, branch, is_active)
      VALUES (
        ${email},
        ${body.display_name?.trim() || null},
        ${body.user_id?.trim() || null},
        ${body.phone?.trim() || null},
        ${JSON.stringify(roles)},
        ${body.branch?.trim() || null},
        ${isActive}
      )
      RETURNING id, email, display_name, user_id, phone, roles, branch, is_active,
                created_at::text, last_login_at::text
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_app_users_email') || msg.includes('unique')) {
      return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });
    }
    console.error('[admin/app-users POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
