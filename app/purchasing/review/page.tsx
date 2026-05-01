import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { getDb } from '../../../db/index';
import { poSubmissions } from '../../../db/schema';
import { and, desc, eq, gte } from 'drizzle-orm';
import ReviewClient from './ReviewClient';

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; branch?: string; days?: string }>;
}) {
  const session = await requirePageAccess('purchasing.review');

  const params = await searchParams;
  const statusFilter = params.status ?? 'all';
  const branchFilter = params.branch ?? '';
  const days = Math.max(1, parseInt(params.days ?? '7', 10) || 7);

  const isAdmin = hasCapability(session, 'branch.all');

  const since = new Date(Date.now() - days * 86_400_000);
  const db = getDb();
  const conditions = [gte(poSubmissions.createdAt, since)];

  if (!isAdmin && session.user.branch) {
    conditions.push(eq(poSubmissions.branch, session.user.branch));
  } else if (branchFilter) {
    conditions.push(eq(poSubmissions.branch, branchFilter));
  }
  if (statusFilter !== 'all') {
    conditions.push(eq(poSubmissions.status, statusFilter));
  }

  const submissions = await db
    .select()
    .from(poSubmissions)
    .where(and(...conditions))
    .orderBy(desc(poSubmissions.createdAt))
    .limit(100);

  let availableBranches: string[] = [];
  if (isAdmin) {
    const branchRows = await db
      .selectDistinct({ branch: poSubmissions.branch })
      .from(poSubmissions)
      .where(eq(poSubmissions.branch, poSubmissions.branch));
    availableBranches = branchRows
      .map((r) => r.branch)
      .filter((b): b is string => b !== null)
      .sort();
  }

  return (
    <ReviewClient
      submissions={submissions}
      statusFilter={statusFilter}
      branchFilter={branchFilter}
      days={days}
      isAdmin={isAdmin}
      availableBranches={availableBranches}
      userName={session.user.name}
      userRole={session.user.role}
    />
  );
}
