import { redirect } from 'next/navigation';

export default function CompletedBidsPage() {
  redirect('/bids?tab=completed');
}
