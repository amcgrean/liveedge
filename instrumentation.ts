// Next.js instrumentation hook — runs once per server/edge runtime startup.
// Wires Sentry into both the nodejs and edge runtimes.
//
// Sentry init is gated on SENTRY_DSN being set. With no DSN configured (local
// dev, CI), this is a complete no-op — no captures, no overhead, no console
// noise. Set SENTRY_DSN in Vercel to enable.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      // Performance traces are noisy and expensive — opt in later if needed.
      tracesSampleRate: 0,
      // Surface release for sourcemaps + grouping. Vercel injects VERCEL_GIT_COMMIT_SHA.
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0,
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
    });
  }
}

// Required for Sentry to capture nested-render / server-action errors in Next 15.
export const onRequestError = Sentry.captureRequestError;
