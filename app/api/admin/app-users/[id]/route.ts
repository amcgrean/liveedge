import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// PATCH /api/admin/app-users/[id] — update user
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('admin.users.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await req.json() as {
    email?: string;
    display_name?: string;
    user_id?: string;
    phone?: string;
    roles?: string[];
    branch?: string;
    is_active?: boolean;
  };

  try {
    const sql = getErpSql();

    // Build update dynamically — only set provided fields
    const updates: string[] = [];
    const vals: (string | boolean | string[] | null)[] = [];
    let idx = 1;

    if (body.email !== undefined) {
      updates.push(`email = $${idx++}`);
      vals.push(body.email.trim().toLowerCase());
    }
    if (body.display_name !== undefined) {
      updates.push(`display_name = $${idx++}`);
      vals.push(body.display_name?.trim() || null);
    }
    if (body.user_id !== undefined) {
      updates.push(`user_id = $${idx++}`);
      vals.push(body.user_id?.trim() || null);
    }
    if (body.phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      vals.push(body.phone?.trim() || null);
    }
    if (body.roles !== undefined) {
      updates.push(`roles = $${idx++}`);
      vals.push(JSON.stringify(Array.isArray(body.roles) ? body.roles : []));
    }
    if (body.branch !== undefined) {
      updates.push(`branch = $${idx++}`);
      vals.push(body.branch?.trim() || null);
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      vals.push(body.is_active);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    const rows = await sql.unsafe(
      `UPDATE app_users SET ${[...updates, 'updated_at = NOW()'].join(', ')} WHERE id = $${idx}
       RETURNING id, email, display_name, user_id, phone, roles, branch, is_active,
                 created_at::text, last_login_at::text`,
      [...vals, userId] as never[]
    );

    if (!rows[0]) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_app_users_email') || msg.includes('unique')) {
      return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });
    }
    console.error('[admin/app-users PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/app-users/[id] — delete user and their OTP codes
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireCapability('admin.users.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const sql = getErpSql();

    // Get email first so we can clean otp_codes (otp_codes is keyed by email, not user id)
    const users = await sql<{ email: string }[]>`SELECT email FROM app_users WHERE id = ${userId}`;
    if (users.length === 0) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    await sql`DELETE FROM otp_codes WHERE email = ${users[0].email}`;
    await sql`DELETE FROM app_users WHERE id = ${userId}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/app-users DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
