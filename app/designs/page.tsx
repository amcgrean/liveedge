import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import DesignsClient from './DesignsClient';

export const metadata = { title: 'Designs | Beisser Lumber' };

export default async function DesignsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <DesignsClient session={session} />;
}
