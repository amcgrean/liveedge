import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import ITIssuesClient from './ITIssuesClient';

export const metadata = { title: 'IT Issues | LiveEdge' };

export default async function ITIssuesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  if (!session) redirect('/login');
  const sp = await searchParams;
  return <ITIssuesClient session={session} autoReport={sp.report === '1'} fromPage={sp.from ?? ''} />;
}
