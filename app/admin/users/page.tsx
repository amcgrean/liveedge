import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { getErpSql } from '../../../db/supabase';
import UsersClient, { type AppUser } from './UsersClient';

export const metadata: Metadata = { title: 'Users | Admin | LiveEdge' };

type AppUserRow = {
  id: number;
  email: string;
  display_name: string | null;
  username: string | null;
  roles: unknown;
  is_active: boolean;
  created_at: string | null;
  branch: string | null;
  agent_id: string | null;
};

function deriveRole(roles: string[]): string {
  if (roles.includes('admin'))      return 'admin';
  if (roles.includes('management')) return 'management';
  if (roles.includes('estimator') || roles.includes('estimating')) return 'estimator';
  if (roles.includes('purchasing')) return 'purchasing';
  if (roles.includes('receiving_yard')) return 'receiving_yard';
  if (roles.includes('warehouse'))  return 'warehouse';
  if (roles.includes('designer'))   return 'designer';
  if (roles.includes('supervisor')) return 'supervisor';
  if (roles.includes('sales'))      return 'sales';
  if (roles.includes('ops'))        return 'ops';
  if (roles.includes('dispatch'))   return 'dispatch';
  return roles.length > 0 ? roles[0] : 'viewer';
}

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') redirect('/');

  let initialUsers: AppUser[] | undefined;
  try {
    const sql = getErpSql();
    const rows = await sql<AppUserRow[]>`
      SELECT id, email, display_name, username, roles, is_active,
             created_at::text, branch, agent_id
      FROM app_users
      ORDER BY display_name NULLS LAST, email
    `;
    initialUsers = rows.map((r) => {
      const roles: string[] = Array.isArray(r.roles) ? (r.roles as string[]) : [];
      return {
        id:        String(r.id),
        name:      r.display_name ?? r.username ?? r.email.split('@')[0],
        email:     r.email,
        username:  r.username ?? null,
        agentId:   r.agent_id ?? null,
        role:      deriveRole(roles),
        roles,
        branch:    r.branch ?? null,
        isActive:  r.is_active,
        createdAt: r.created_at ?? new Date(0).toISOString(),
      };
    });
  } catch {
    // Fall through — UsersClient will fetch on mount
  }

  return <UsersClient initialUsers={initialUsers} />;
}
