import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AddDesignClient from './AddDesignClient';

export const metadata = { title: 'New Design | LiveEdge' };

export default async function AddDesignPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <AddDesignClient session={session} />;
}
