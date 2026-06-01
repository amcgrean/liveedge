// Client-side Sentry init. Next.js auto-loads this in the browser bundle.
//
// Gated on NEXT_PUBLIC_SENTRY_DSN. With no DSN configured this is a complete
// no-op. Use the public-prefix var because the browser bundle can't read
// server-only env.

import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Session Replay is expensive — keep off until we know we want it.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? undefined,
  });
}
