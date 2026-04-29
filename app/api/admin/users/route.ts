import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// All admin/users routes now operate on public.app_users (unified auth table).
// bids."user" is kept as-is (read-only, FK references intact) but is no longer
// the source of truth for authentication.

function dbError(err: unknown) {
  console.error('[admin/users API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.user.role !== 'admin') return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  return { session };
}

type AppUserRow = {
  id: number;
  email: string;
  display_name: string | null;
  username: string | null;
  roles: string[] | null;
  is_active: boolean;
  created_at: string | null;
  branch: string | null;
  agent_id: string | null;
};

// Map app_users row → UI-facing object
function toUserDto(r: AppUserRow) {
  const roles: string[] = Array.isArray(r.roles) ? r.roles : [];
  // Derive a single-role label for the existing UI
  const role = roles.includes('admin')
    ? 'admin'
    : roles.includes('management')
    ? 'management'
    : roles.includes('estimator') || roles.includes('estimating')
    ? 'estimator'
    : roles.includes('purchasing')
    ? 'purchasing'
    : roles.includes('receiving_yard')
    ? 'receiving_yard'
    : roles.includes('warehouse')
    ? 'warehouse'
    : roles.includes('designer')
    ? 'designer'
    : roles.includes('supervisor')
    ? 'supervisor'
    : roles.includes('sales')
    ? 'sales'
    : roles.includes('ops')
    ? 'ops'
    : roles.includes('dispatch')
    ? 'dispatch'
    : roles.length > 0
    ? roles[0]
    : 'viewer';

  return {
    id:        String(r.id),
    name:      r.display_name ?? r.username ?? r.email.split('@')[0],
    email:     r.email,
    username:  r.username ?? null,
    agentId:   r.agent_id ?? null,
    role,
    roles,
    branch:    r.branch ?? null,
    isActive:  r.is_active,
    createdAt: r.created_at ?? new Date(0).toISOString(),
  };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const sql = getErpSql();
    const rows = await sql<AppUserRow[]>`
      SELECT id, email, display_name, username, roles, is_active,
             created_at::text, branch, agent_id
      FROM app_users
      ORDER BY display_name NULLS LAST, email
    `;
    return NextResponse.json({ users: rows.map(toUserDto) });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: {
    name?: string;       // display name
    username?: string;
    email?: string;
    agentId?: string;
    role?: string;
    roles?: string[];
    password?: string;
    branch?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // username is required for password-based users; email is always required
  const email = body.email?.trim().toLowerCase();
  const username = (body.username ?? body.name ?? '').trim().toLowerCase() || null;

  if (!email && !username) {
    return NextResponse.json({ error: 'email or username is required' }, { status: 422 });
  }

  // Build roles array from either explicit roles[] or single role string
  let roles: string[];
  if (Array.isArray(body.roles) && body.roles.length > 0) {
    roles = body.roles;
  } else if (body.role) {
    roles = [body.role];
  } else {
    roles = ['estimator'];
  }

  let passwordHash: string | null = null;
  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 422 });
    }
    const bcrypt = (await import('bcryptjs')).default;
    passwordHash = await bcrypt.hash(body.password, 12);
  } else if (username && !email?.includes('@')) {
    // Username-only users need a password
    return NextResponse.json({ error: 'Password is required for username-only users' }, { status: 422 });
  }

  const displayName = body.name?.trim() || username || (email ? email.split('@')[0] : null);
  const finalEmail = email ?? `${username}@beisserlumber.local`;
  const branch = body.branch?.trim() || null;
  const agentId = body.agentId?.trim().toLowerCase() || null;

  try {
    const sql = getErpSql();
    const [row] = await sql<AppUserRow[]>`
      INSERT INTO app_users (email, display_name, username, password_hash, roles, branch, is_active, agent_id)
      VALUES (
        ${finalEmail},
        ${displayName},
        ${username},
        ${passwordHash},
        ${JSON.stringify(roles)}::json,
        ${branch},
        true,
        ${agentId}
      )
      RETURNING id, email, display_name, username, roles, is_active,
                created_at::text, branch, agent_id
    `;
    return NextResponse.json({ user: toUserDto(row) }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('uq_app_users')) {
      return NextResponse.json({ error: 'A user with that email or username already exists.' }, { status: 409 });
    }
    return dbError(err);
  }
}
