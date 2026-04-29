import { redirect } from 'next/navigation';

export default function HistoryPage() {
  redirect('/sales/transactions?tab=history');
}
