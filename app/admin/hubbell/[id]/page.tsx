import { requirePageAccess } from '../../../../src/lib/access-control';
import DocumentDetailClient from './DocumentDetailClient';

export const metadata = { title: 'Document Detail — LiveEdge Admin' };

export default async function HubbellDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess('hubbell.review');
  const { id } = await params;
  return <DocumentDetailClient documentId={id} />;
}
