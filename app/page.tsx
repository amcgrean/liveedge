import { auth } from '../auth';
import { redirect } from 'next/navigation';
import TakeoffApp from '../src/TakeoffApp';

interface Props {
  searchParams: Promise<{ bid?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect('/login');
  const { bid } = await searchParams;
  return <TakeoffApp session={session} initialBidId={bid} />;
}
