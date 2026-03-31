import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ManageITIssueClient from './ManageITIssueClient';

export const metadata = { title: 'Manage IT Issue | Beisser Lumber' };

export default async function ManageITIssuePage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <ManageITIssueClient session={session} />;
}
