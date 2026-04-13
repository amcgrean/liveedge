import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import PodCaptureClient from './PodCaptureClient';

interface PageProps {
  params: Promise<{ so: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PodCapturePage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { so } = await params;
  const sp = await searchParams;
  const branch      = Array.isArray(sp.branch)      ? sp.branch[0]      : (sp.branch ?? '');
  const shipmentNum = Array.isArray(sp.shipment)     ? sp.shipment[0]    : (sp.shipment ?? '1');
  const guid        = Array.isArray(sp.guid)         ? sp.guid[0]        : (sp.guid ?? '');
  const customerName = Array.isArray(sp.customer)    ? sp.customer[0]    : (sp.customer ?? '');

  return (
    <PodCaptureClient
      soNumber={so}
      branchCode={branch}
      shipmentNum={parseInt(shipmentNum, 10) || 1}
      agilityGuid={guid}
      customerName={customerName}
      driverName={session.user.name ?? ''}
    />
  );
}
