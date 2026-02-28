import { Metadata } from 'next';
import CustomersClient from './CustomersClient';

export const metadata: Metadata = { title: 'Customers | Admin | Beisser Takeoff' };

export default function CustomersPage() {
  return <CustomersClient />;
}
