import { redirect } from 'next/navigation';

export default function LegacyBidsPage() {
  redirect('/bids?tab=open');
}
