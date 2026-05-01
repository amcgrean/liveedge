import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { fetchOpenPickers, type PickerSummary } from '../../../src/lib/warehouse-open-picks';
import OpenPicksClient from './OpenPicksClient';

export default async function OpenPicksPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'warehouse'].includes(r));

  let initialPickers: PickerSummary[] = [];
  try {
    initialPickers = await fetchOpenPickers();
  } catch (err) {
    console.error('[warehouse/open-picks page] Failed to load initial pickers:', err);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <OpenPicksClient isAdmin={isAdmin} initialPickers={initialPickers} />
    </div>
  );
}
