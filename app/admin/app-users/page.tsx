import { redirect } from 'next/navigation';

// /admin/app-users is retired — all users are now managed at /admin/users.
export default function AppUsersRedirect() {
  redirect('/admin/users');
}
