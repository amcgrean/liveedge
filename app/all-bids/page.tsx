import { redirect } from 'next/navigation';

export default function AllBidsPage() {
  redirect('/bids?tab=all');
}
