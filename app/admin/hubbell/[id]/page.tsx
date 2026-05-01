import { requirePageAccess } from '../../../../src/lib/access-control';
import EmailDetailClient from './EmailDetailClient';

export const metadata = { title: 'Email Detail — LiveEdge Admin' };

export default async function HubbellEmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess('hubbell.review');
  const { id } = await params;
  return <EmailDetailClient emailId={id} />;
}
