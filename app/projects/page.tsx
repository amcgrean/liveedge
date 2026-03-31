import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import ProjectsClient from './ProjectsClient';

export const metadata = { title: 'Projects | Beisser Lumber' };

export default async function ProjectsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <ProjectsClient session={session} />;
}
