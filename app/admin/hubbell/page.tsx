import { requirePageAccess } from '../../../src/lib/access-control';
import DocumentsClient from './DocumentsClient';

export const metadata = { title: 'Hubbell Documents — LiveEdge Admin' };

export default async function HubbellPage() {
  await requirePageAccess('hubbell.review');
  return <DocumentsClient />;
}
