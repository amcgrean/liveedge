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

type PermissionEvent =
  | 'validation_error'
  | 'user_not_found'
  | 'stale_write_conflict'
  | 'last_admin_lockout'
  | 'success'
  | 'internal_error';

/**
 * Structured log emit for permission-update outcomes. One line per terminal
 * branch so failure rates are countable from logs without parsing prose.
 *
 * Log shape: { evt: 'permissions_update', outcome, actorId, targetUserId, ... }
 */
function logPermissionEvent(
  outcome: PermissionEvent,
  fields: Record<string, unknown>
): void {
  const payload = { evt: 'permissions_update', outcome, ...fields };
  // Errors (4xx caused-by-caller or 5xx) → stderr; successes → stdout.
  if (outcome === 'internal_error') {
    console.error(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

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
  const actorIdEarly = parseInt(session.user.id ?? '0', 10);
  if (isNaN(userId)) {
    logPermissionEvent('validation_error', { actorId: actorIdEarly, reason: 'invalid_target_id', rawId: id });
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  let body: {
    roles?: string[];
    granted_capabilities?: string[];
    revoked_capabilities?: string[];
    if_match_version?: string;
    change_reason?: string;
    ticket_ref?: string;
  };
  try { body = await req.json(); } catch {
    logPermissionEvent('validation_error', { actorId: actorIdEarly, targetUserId: userId, reason: 'invalid_json' });
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roles = Array.isArray(body.roles) ? body.roles : undefined;
  const granted = Array.isArray(body.granted_capabilities) ? body.granted_capabilities : [];
  const revoked = Array.isArray(body.revoked_capabilities) ? body.revoked_capabilities : [];
  const ifMatchVersion = typeof body.if_match_version === 'string' ? body.if_match_version.trim() : '';
  const changeReason = typeof body.change_reason === 'string' ? body.change_reason.trim() : '';
  const ticketRef = typeof body.ticket_ref === 'string' ? body.ticket_ref.trim() : '';

  if (!ifMatchVersion) {
    logPermissionEvent('validation_error', { actorId: actorIdEarly, targetUserId: userId, reason: 'missing_if_match_version' });
    return NextResponse.json({ error: 'if_match_version is required' }, { status: 400 });
  }
  if (!changeReason) {
    logPermissionEvent('validation_error', { actorId: actorIdEarly, targetUserId: userId, reason: 'missing_change_reason' });
    return NextResponse.json({ error: 'change_reason is required for permission updates' }, { status: 400 });
  }

  // Validate all capability codes
  const unknownGranted = granted.filter((c) => !ALL_CAPABILITIES.has(c as never));
  const unknownRevoked = revoked.filter((c) => !ALL_CAPABILITIES.has(c as never));
  if (unknownGranted.length || unknownRevoked.length) {
    logPermissionEvent('validation_error', {
      actorId: actorIdEarly,
      targetUserId: userId,
      reason: 'unknown_capability',
      unknown: [...unknownGranted, ...unknownRevoked],
    });
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
    if (current.length === 0) {
      logPermissionEvent('user_not_found', { actorId: actorIdEarly, targetUserId: userId });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const prev = current[0];

    const prevRoles: string[] = Array.isArray(prev.roles) ? prev.roles : [];
    const prevGranted: string[] = Array.isArray(prev.granted_capabilities) ? prev.granted_capabilities : [];
    const prevRevoked: string[] = Array.isArray(prev.revoked_capabilities) ? prev.revoked_capabilities : [];
    const prevVersion = prev.updated_at ? new Date(prev.updated_at).toISOString() : null;

    if (!prevVersion || prevVersion !== ifMatchVersion) {
      logPermissionEvent('stale_write_conflict', {
        actorId: actorIdEarly,
        targetUserId: userId,
        detected_at: 'precheck',
        client_version: ifMatchVersion,
        current_version: prevVersion,
      });
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

    // The last-admin precheck and the UPDATE must share a snapshot, otherwise
    // two concurrent self-edits can both pass the precheck and both commit,
    // zeroing out the admin set. Wrap in a transaction and lock the rows the
    // precheck reads.
    //
    // The optimistic-lock comparison truncates `updated_at` to millisecond
    // precision because the client receives `new Date(updated_at).toISOString()`
    // (ms precision) but the column itself is `timestamptz` (µs precision) —
    // without `date_trunc` the WHERE never matches and every save returns 409.
    // TODO: a dedicated `permissions_version bigint` column would be cleaner
    // long-term, but date_trunc is the minimal-blast-radius fix.
    const actorId = actorIdEarly;
    const isSelfEdit = !isNaN(actorId) && actorId > 0 && actorId === userId;

    const txResult = await sql.begin(async (txRaw) => {
      // postgres.js types `TransactionSql` without the template-tag call
      // signature its outer `Sql` exposes, so we re-cast to `typeof sql` for
      // type-level callability. Runtime behavior is unchanged.
      const tx = txRaw as unknown as typeof sql;
      if (isSelfEdit) {
        const activeUsers = (await tx`
          SELECT id, roles, granted_capabilities, revoked_capabilities
          FROM app_users
          WHERE is_active = true
          FOR UPDATE
        `) as Pick<AppUserRow, 'id' | 'roles' | 'granted_capabilities' | 'revoked_capabilities'>[];
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
          return { lockout: true as const };
        }
      }

      // Apply update — `roles` is a json column (see /api/admin/users/[id]/route.ts);
      // granted/revoked_capabilities are text[] (migration 0015_user_capabilities.sql).
      const updateRows = (roles !== undefined
        ? await tx`
            UPDATE app_users
            SET roles = ${JSON.stringify(newRoles)}::json,
                granted_capabilities = ${tx.array(normalizedGranted)}::text[],
                revoked_capabilities = ${tx.array(normalizedRevoked)}::text[],
                updated_at = NOW()
            WHERE id = ${userId}
              AND date_trunc('milliseconds', updated_at) = ${ifMatchVersion}::timestamptz
            RETURNING updated_at
          `
        : await tx`
            UPDATE app_users
            SET granted_capabilities = ${tx.array(normalizedGranted)}::text[],
                revoked_capabilities = ${tx.array(normalizedRevoked)}::text[],
                updated_at = NOW()
            WHERE id = ${userId}
              AND date_trunc('milliseconds', updated_at) = ${ifMatchVersion}::timestamptz
            RETURNING updated_at
          `) as Pick<AppUserRow, 'updated_at'>[];

      return { lockout: false as const, updateRows };
    });

    if (txResult.lockout) {
      logPermissionEvent('last_admin_lockout', { actorId: actorIdEarly, targetUserId: userId });
      return NextResponse.json({
        error: 'Blocked: cannot remove the last active admin capability from your own account',
        code: 'last_admin_lockout',
      }, { status: 409 });
    }

    const updateRows = txResult.updateRows;

    if (updateRows.length === 0) {
      const fresh = await sql<Pick<AppUserRow, 'updated_at'>[]>`SELECT updated_at FROM app_users WHERE id = ${userId} LIMIT 1`;
      const currentVersion = fresh[0]?.updated_at ? new Date(fresh[0].updated_at).toISOString() : null;
      logPermissionEvent('stale_write_conflict', {
        actorId: actorIdEarly,
        targetUserId: userId,
        detected_at: 'update',
        client_version: ifMatchVersion,
        current_version: currentVersion,
      });
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
    logPermissionEvent('success', {
      actorId: actorIdEarly,
      targetUserId: userId,
      isSelfEdit,
      roles_changed: JSON.stringify(newRoles.sort()) !== JSON.stringify(prevRoles.sort()),
      granted_changed: JSON.stringify(normalizedGranted.sort()) !== JSON.stringify(prevGranted.sort()),
      revoked_changed: JSON.stringify(normalizedRevoked.sort()) !== JSON.stringify(prevRevoked.sort()),
    });
    return NextResponse.json({
      success: true,
      roles: newRoles,
      granted_capabilities: normalizedGranted,
      revoked_capabilities: normalizedRevoked,
      effective_capabilities: newEffective,
      permissions_version: permissionsVersion,
    });
  } catch (err) {
    logPermissionEvent('internal_error', {
      actorId: actorIdEarly,
      targetUserId: userId,
      message: err instanceof Error ? err.message : String(err),
    });
    console.error('[permissions PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
