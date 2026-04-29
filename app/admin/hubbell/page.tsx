import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import HubbellClient from './HubbellClient';

export const metadata = { title: 'Hubbell Emails — LiveEdge Admin' };

export default async function HubbellPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') redirect('/');

  return <HubbellClient />;
}
