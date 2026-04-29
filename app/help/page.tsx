import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import HelpClient from './HelpClient';

export const metadata = { title: 'Help & Documentation | LiveEdge' };

export default async function HelpPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <Suspense fallback={null}>
      <HelpClient />
    </Suspense>
  );
}
