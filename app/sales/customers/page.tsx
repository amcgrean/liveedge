import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import CustomersClient from './CustomersClient';

export const metadata = { title: 'Customers' };

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav
        userName={session.user.name}
        userRole={session.user.role}
      />
      <CustomersClient />
    </div>
  );
}
