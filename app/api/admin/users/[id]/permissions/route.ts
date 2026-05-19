import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../../src/lib/access-control';
import {
  ALL_CAPABILITIES,
  ROLE_DEFAULTS,
  effectiveCapabilities,
} from '../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../db/supabase';
import { getDb } from '../../../../../../db/index';
import { legacyGeneralAudit } from '../../../../../../db/schema-legacy';

type RouteContext = { params: Promise<{ id: string }> };

type AppUserRow = {
  id: number;
  display_name: string | null;
  username: string | null;
  email: string;
  roles: string[] | null;
  granted_capabilities: string[] | null;
  revoked_capabilities: string[] | null;
  is_active: boolean;
  updated_at?: string | Date | null;
};

export async function GET(_req: NextRequest, context: RouteContext) {
  const authResult = await requireCapability('admin.users.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await context.params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const sql = getErpSql();
    const rows = await sql<AppUserRow[]>`
      SELECT id, display_name, username, email, roles,
             granted_capabilities, revoked_capabilities, is_active, updated_at
      FROM app_users
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const u = rows[0];
    const roles: string[] = Array.isArray(u.roles) ? u.roles : [];
    const granted: string[] = Array.isArray(u.granted_capabilities) ? u.granted_capabilities : [];
    const revoked: string[] = Array.isArray(u.revoked_capabilities) ? u.revoked_capabilities : [];

    const effective = Array.from(effectiveCapabilities(roles, granted, revoked));

    // Build per-role defaults map for the UI
    const roleDefaults: Record<string, string[]> = {};
    for (const role of roles) {
      if (ROLE_DEFAULTS[role]) roleDefaults[role] = [...ROLE_DEFAULTS[role]];
    }

    return NextResponse.json({
      user: {
        id: String(u.id),
        name: u.display_name ?? u.username ?? u.email.split('@')[0],
        username: u.username ?? null,
        email: u.email,
        roles,
        isActive: u.is_active,
      },
      granted_capabilities: granted,
      revoked_capabilities: revoked,
      effective_capabilities: effective,
      role_defaults: roleDefaults,
      permissions_version: u.updated_at ? new Date(u.updated_at).toISOString() : null,
    });
  } catch (err) {
    console.error('[permissions GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const authResult = await requireCapability('admin.users.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { id } = await context.params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: {
    roles?: string[];
    granted_capabilities?: string[];
    revoked_capabilities?: string[];
    if_match_version?: string;
    change_reason?: string;
    ticket_ref?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const roles = Array.isArray(body.roles) ? body.roles : undefined;
  const granted = Array.isArray(body.granted_capabilities) ? body.granted_capabilities : [];
  const revoked = Array.isArray(body.revoked_capabilities) ? body.revoked_capabilities : [];
  const ifMatchVersion = typeof body.if_match_version === 'string' ? body.if_match_version.trim() : '';
  const changeReason = typeof body.change_reason === 'string' ? body.change_reason.trim() : '';
  const ticketRef = typeof body.ticket_ref === 'string' ? body.ticket_ref.trim() : '';

  if (!ifMatchVersion) {
    return NextResponse.json({ error: 'if_match_version is required' }, { status: 400 });
  }
  if (!changeReason) {
    return NextResponse.json({ error: 'change_reason is required for permission updates' }, { status: 400 });
  }

  // Validate all capability codes
  const unknownGranted = granted.filter((c) => !ALL_CAPABILITIES.has(c as never));
  const unknownRevoked = revoked.filter((c) => !ALL_CAPABILITIES.has(c as never));
  if (unknownGranted.length || unknownRevoked.length) {
    return NextResponse.json(
      { error: `Unknown capabilities: ${[...unknownGranted, ...unknownRevoked].join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const sql = getErpSql();

    // Fetch current state for diff/audit
    const current = await sql<AppUserRow[]>`
      SELECT id, display_name, username, email, roles,
             granted_capabilities, revoked_capabilities, is_active, updated_at
      FROM app_users
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (current.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const prev = current[0];

    const prevRoles: string[] = Array.isArray(prev.roles) ? prev.roles : [];
    const prevGranted: string[] = Array.isArray(prev.granted_capabilities) ? prev.granted_capabilities : [];
    const prevRevoked: string[] = Array.isArray(prev.revoked_capabilities) ? prev.revoked_capabilities : [];
    const prevVersion = prev.updated_at ? new Date(prev.updated_at).toISOString() : null;

    if (!prevVersion || prevVersion !== ifMatchVersion) {
      return NextResponse.json({
        error: 'Permission record changed since last read',
        code: 'stale_write_conflict',
        current_version: prevVersion,
      }, { status: 409 });
    }

    const newRoles = roles ?? prevRoles;

    // Normalize: remove redundant grants (already in role defaults) and redundant revokes
    const roleDefaultSet = new Set(
      newRoles.flatMap((r) => (ROLE_DEFAULTS[r] ? [...ROLE_DEFAULTS[r]] : []))
    );
    const normalizedGranted = granted.filter((c) => !roleDefaultSet.has(c as never));
    const normalizedRevoked = revoked.filter((c) => roleDefaultSet.has(c as never));

    // Break-glass: prevent last-admin self lockout (admin.users.manage capability)
    const actorId = parseInt(session.user.id ?? '0', 10);
    if (!isNaN(actorId) && actorId > 0 && actorId === userId) {
      const activeUsers = await sql<Pick<AppUserRow, 'id' | 'roles' | 'granted_capabilities' | 'revoked_capabilities'>[]>`
        SELECT id, roles, granted_capabilities, revoked_capabilities
        FROM app_users
        WHERE is_active = true
      `;
      let adminsAfter = 0;
      for (const row of activeUsers) {
        const rowRoles = Array.isArray(row.roles) ? row.roles : [];
        const rowGranted = Array.isArray(row.granted_capabilities) ? row.granted_capabilities : [];
        const rowRevoked = Array.isArray(row.revoked_capabilities) ? row.revoked_capabilities : [];
        const effective = row.id === userId
          ? effectiveCapabilities(newRoles, normalizedGranted, normalizedRevoked)
          : effectiveCapabilities(rowRoles, rowGranted, rowRevoked);
        if (effective.has('admin.users.manage')) adminsAfter += 1;
      }
      if (adminsAfter < 1) {
        return NextResponse.json({
          error: 'Blocked: cannot remove the last active admin capability from your own account',
          code: 'last_admin_lockout',
        }, { status: 409 });
      }
    }

    // Apply update — `roles` is a json column (see /api/admin/users/[id]/route.ts);
    // granted/revoked_capabilities are text[] (migration 0015_user_capabilities.sql).
    const updateRows = roles !== undefined
      ? await sql<Pick<AppUserRow, 'updated_at'>[]>`
          UPDATE app_users
          SET roles = ${JSON.stringify(newRoles)}::json,
              granted_capabilities = ${sql.array(normalizedGranted)}::text[],
              revoked_capabilities = ${sql.array(normalizedRevoked)}::text[],
              updated_at = NOW()
          WHERE id = ${userId} AND updated_at = ${ifMatchVersion}::timestamptz
          RETURNING updated_at
        `
      : await sql<Pick<AppUserRow, 'updated_at'>[]>`
          UPDATE app_users
          SET granted_capabilities = ${sql.array(normalizedGranted)}::text[],
              revoked_capabilities = ${sql.array(normalizedRevoked)}::text[],
              updated_at = NOW()
          WHERE id = ${userId} AND updated_at = ${ifMatchVersion}::timestamptz
          RETURNING updated_at
        `;

    if (updateRows.length === 0) {
      const fresh = await sql<Pick<AppUserRow, 'updated_at'>[]>`SELECT updated_at FROM app_users WHERE id = ${userId} LIMIT 1`;
      const currentVersion = fresh[0]?.updated_at ? new Date(fresh[0].updated_at).toISOString() : null;
      return NextResponse.json({
        error: 'Permission record changed since last read',
        code: 'stale_write_conflict',
        current_version: currentVersion,
      }, { status: 409 });
    }

    const permissionsVersion = updateRows[0]?.updated_at ? new Date(updateRows[0].updated_at).toISOString() : null;

    // Audit log
    try {
      const adminId = actorId;
      if (!isNaN(adminId) && adminId > 0) {
        const db = getDb();
        const changes: Record<string, unknown> = { targetUserId: userId };
        if (JSON.stringify(newRoles.sort()) !== JSON.stringify(prevRoles.sort())) {
          changes.roles = { from: prevRoles, to: newRoles };
        }
        if (JSON.stringify(normalizedGranted.sort()) !== JSON.stringify(prevGranted.sort())) {
          changes.granted_capabilities = { from: prevGranted, to: normalizedGranted };
        }
        if (JSON.stringify(normalizedRevoked.sort()) !== JSON.stringify(prevRevoked.sort())) {
          changes.revoked_capabilities = { from: prevRevoked, to: normalizedRevoked };
        }
        await db.insert(legacyGeneralAudit).values({
          userId: adminId,
          action: 'update_permissions',
          modelName: 'app_user',
          changes: JSON.stringify({
            ...changes,
            governance: {
              if_match_version: ifMatchVersion,
              resulting_version: permissionsVersion,
              change_reason: changeReason,
              ticket_ref: ticketRef || null,
            },
          }),
        });
      }
    } catch (auditErr) {
      console.error('[permissions audit]', auditErr);
    }

    const newEffective = Array.from(effectiveCapabilities(newRoles, normalizedGranted, normalizedRevoked));
    return NextResponse.json({
      success: true,
      roles: newRoles,
      granted_capabilities: normalizedGranted,
      revoked_capabilities: normalizedRevoked,
      effective_capabilities: newEffective,
      permissions_version: permissionsVersion,
    });
  } catch (err) {
    console.error('[permissions PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
