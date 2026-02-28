import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from 'next-auth/react';
import { auth } from '../auth';

export const metadata: Metadata = {
  title: 'Beisser Takeoff | House Estimator',
  description: 'Beisser Lumber Co. Digital Takeoff Estimator',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
