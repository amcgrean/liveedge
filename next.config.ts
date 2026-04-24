import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
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

export default withSerwist(nextConfig);
