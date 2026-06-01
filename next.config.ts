import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  serverExternalPackages: ['ws'],
  webpack: (config) => {
    // pdfjs-dist worker needs to be served as a static asset
    config.resolve.alias.canvas = false;
    return config;
  },
};

// Sentry build-time wrapper. Source-map upload is gated on SENTRY_AUTH_TOKEN
// being present at build time (Vercel env). Without it the wrapper is a
// passthrough — no upload attempted, no build-time errors.
const sentryEnabled = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

const config = withSerwist(nextConfig);

export default sentryEnabled
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // Skip tunnel route — uBlock + corporate firewalls block the SDK, but
      // Beisser staff are on internal devices where it's fine.
      tunnelRoute: undefined,
      disableLogger: true,
      automaticVercelMonitors: false,
    })
  : config;
