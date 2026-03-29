import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TakeoffWorkspace } from './TakeoffWorkspace';

interface Props {
  params: Promise<{ sessionId: string }>;
}

export default async function TakeoffSessionPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect('/login');

  const { sessionId } = await params;

  return <TakeoffWorkspace sessionId={sessionId} />;
}
