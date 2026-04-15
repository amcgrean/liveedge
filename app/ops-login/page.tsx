import { redirect } from 'next/navigation';

// /ops-login is retired — all users now sign in via the unified /login page.
export default function OpsLoginRedirect() {
  redirect('/login');
}
