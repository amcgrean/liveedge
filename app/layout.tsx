import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SessionProvider } from 'next-auth/react';
import { auth } from '../auth';

export const metadata: Metadata = {
  title: 'Beisser LiveEdge',
  description: 'Beisser Lumber internal operations platform — estimating, yard, dispatch, purchasing, and sales tools.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/beisser_B_full_color_RGB.png',
    apple: '/icons/beisser_B_full_color_RGB.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LiveEdge',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#006834',
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
