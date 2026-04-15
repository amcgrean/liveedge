import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { TakeoffSessionList } from './TakeoffSessionList';

export default async function TakeoffPage() {
  const session = await auth();
  if (!session) redirect('/login');

  let sessions: Array<{
    id: string;
    name: string;
    pdfFileName: string | null;
    pageCount: number;
    createdAt: Date;
    bidId: string | null;
    legacyBidId: number | null;
    bidJobName: string | null;
    bidNumber: string | null;
  }> = [];

  try {
    const { getDb, schema } = await import('../../db/index');
    const { eq, desc } = await import('drizzle-orm');
    const db = getDb();
    const results = await db
      .select({
        id: schema.takeoffSessions.id,
        name: schema.takeoffSessions.name,
        pdfFileName: schema.takeoffSessions.pdfFileName,
        pageCount: schema.takeoffSessions.pageCount,
        createdAt: schema.takeoffSessions.createdAt,
        bidId: schema.takeoffSessions.bidId,
        legacyBidId: schema.takeoffSessions.legacyBidId,
        bidJobName: schema.bids.jobName,
        bidNumber: schema.bids.bidNumber,
      })
      .from(schema.takeoffSessions)
      .leftJoin(schema.bids, eq(schema.takeoffSessions.bidId, schema.bids.id))
      .orderBy(desc(schema.takeoffSessions.createdAt))
      .limit(50);

    sessions = results;
  } catch {
    // DB not available — show empty state
  }

  return <TakeoffSessionList sessions={sessions} />;
}
