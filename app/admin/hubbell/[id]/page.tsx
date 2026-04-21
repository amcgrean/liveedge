import { redirect } from 'next/navigation';
import { auth } from '../../../../auth';
import EmailDetailClient from './EmailDetailClient';

export const metadata = { title: 'Email Detail — LiveEdge Admin' };

export default async function HubbellEmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') redirect('/');

  const { id } = await params;
  return <EmailDetailClient emailId={id} />;
}
