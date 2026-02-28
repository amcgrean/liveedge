import { Metadata } from 'next';
import UsersClient from './UsersClient';

export const metadata: Metadata = { title: 'Users | Admin | Beisser Takeoff' };

export default function UsersPage() {
  return <UsersClient />;
}
