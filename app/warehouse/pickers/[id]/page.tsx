import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import PickerDetailClient from './PickerDetailClient';

export default async function PickerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;

  return <PickerDetailClient id={id} />;
}
