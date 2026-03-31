/**
 * Shared auth utilities for API routes and server components.
 * Centralizes common auth patterns that were previously duplicated
 * across individual route handlers.
 */
import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '../../auth';
import { hasPermission, type Permission } from './permissions';

/**
 * Get the current session or return a 401 response.
 * Use in API routes: `const session = await requireAuth(); if (session instanceof NextResponse) return session;`
 */
export async function requireAuth(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

/**
 * Check that the current user is an admin. Returns 403 if not.
 */
export async function requireAdmin(): Promise<Session | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return result;
}

/**
 * Check that the current user has one of the specified roles.
 */
export async function requireRole(
  ...roles: string[]
): Promise<Session | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (!roles.includes(result.user.role)) {
    return NextResponse.json(
      { error: `Requires one of: ${roles.join(', ')}` },
      { status: 403 }
    );
  }
  return result;
}

/**
 * Check that the current user has a specific legacy permission.
 * Falls back to role-based check if permission lookup fails.
 */
export async function requirePermission(
  permission: Permission
): Promise<Session | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const userId = parseInt(result.user.id, 10);
  if (isNaN(userId)) {
    // Dev user or non-numeric ID — fall back to role check
    if (result.user.role === 'admin') return result;
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }

  const allowed = await hasPermission(userId, result.user.role, permission);
  if (!allowed) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  }
  return result;
}

/**
 * Get the user's branch ID from the session token.
 */
export function getBranchId(session: Session): number | null {
  return (session.user as { branchId?: number | null }).branchId ?? null;
}
