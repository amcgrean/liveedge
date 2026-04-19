import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import bcrypt from 'bcryptjs';

function dbError(err: unknown) {
  console.error('[admin/users/[id]]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: {
    name?: string;
    email?: string;
    username?: string;
    agentId?: string;
    role?: string;
    roles?: string[];
    isActive?: boolean;
    password?: string;
    branch?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Build the SET clause dynamically
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined)     updates.display_name = body.name.trim() || null;
  if (body.email !== undefined)    updates.email = body.email ? body.email.trim().toLowerCase() : null;
  if (body.username !== undefined) updates.username = body.username ? body.username.trim().toLowerCase() : null;
  if (body.agentId !== undefined)  updates.agent_id = body.agentId ? body.agentId.trim().toLowerCase() : null;
  if (body.branch !== undefined)   updates.branch = body.branch?.trim() || null;
  if (body.isActive !== undefined) updates.is_active = body.isActive;

  if (Array.isArray(body.roles) && body.roles.length > 0) {
    updates.roles = JSON.stringify(body.roles);
  } else if (body.role) {
    updates.roles = JSON.stringify([body.role]);
  }

  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 422 });
    }
    updates.password_hash = await bcrypt.hash(body.password, 12);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  try {
    const sql = getErpSql();

    // Build parameterized SET clause
    const setClauses = Object.keys(updates)
      .map((k, i) => `${k} = $${i + 2}`)
      .join(', ');
    const values = [userId, ...Object.values(updates)] as (string | number | boolean | null)[];

    type UserRow = {
      id: number; email: string; display_name: string | null;
      username: string | null; roles: string[] | null; is_active: boolean;
      created_at: string | null; branch: string | null; agent_id: string | null;
    };
    const rows = await sql.unsafe<UserRow[]>(
      `UPDATE app_users SET ${setClauses} WHERE id = $1
       RETURNING id, email, display_name, username, roles, is_active, created_at::text, branch, agent_id`,
      values
    );

    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const r = rows[0];
    const rolesArr: string[] = Array.isArray(r.roles) ? r.roles : [];
    return NextResponse.json({
      user: {
        id:       String(r.id),
        name:     r.display_name ?? r.username ?? r.email.split('@')[0],
        email:    r.email,
        username: r.username ?? null,
        agentId:  r.agent_id ?? null,
        role:     rolesArr[0] ?? 'viewer',
        roles:    rolesArr,
        branch:   r.branch ?? null,
        isActive: r.is_active,
      },
    });
  } catch (err) { return dbError(err); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  try {
    const sql = getErpSql();
    await sql`UPDATE app_users SET is_active = false WHERE id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (err) { return dbError(err); }
}
