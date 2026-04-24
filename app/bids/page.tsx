import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import BidsHubClient from './BidsHubClient';

export const metadata = { title: 'Bids | LiveEdge' };

type Tab = 'open' | 'completed' | 'all' | 'projects';

function parseTab(v: string | string[] | undefined): Tab {
  if (v === 'completed' || v === 'all' || v === 'projects' || v === 'open') return v;
  return 'open';
}

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function BidsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect('/login');
  const { tab } = await searchParams;
  return <BidsHubClient session={session} initialTab={parseTab(tab)} />;
}
