import type { Metadata, Viewport } from 'next';
import './globals.css';
import { JetBrains_Mono } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import { auth } from '../auth';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Beisser LiveEdge',
  description: 'Beisser Lumber internal operations platform — estimating, yard, dispatch, purchasing, and sales tools.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
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
      <body className={jetbrainsMono.variable}>
        <div className="branch-edge" />
        <SessionProvider session={session}>{children}</SessionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
