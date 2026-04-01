import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['ws'],
  webpack: (config) => {
    // pdfjs-dist worker needs to be served as a static asset
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
