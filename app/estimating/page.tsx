import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import TakeoffApp from '../../src/TakeoffApp';

export const metadata = { title: 'Estimating | LiveEdge' };

interface Props {
  searchParams: Promise<{ bid?: string }>;
}

export default async function EstimatingPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect('/login');
  const { bid } = await searchParams;
  return <TakeoffApp session={session} initialBidId={bid} />;
}
