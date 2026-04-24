import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import TakeoffApp from '../../../src/TakeoffApp';

export const metadata = { title: 'Estimating | LiveEdge' };

interface Props {
  params: Promise<{ bidId: string }>;
}

export default async function EstimatingBidPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect('/login');
  const { bidId } = await params;
  return <TakeoffApp session={session} initialBidId={bidId} />;
}
