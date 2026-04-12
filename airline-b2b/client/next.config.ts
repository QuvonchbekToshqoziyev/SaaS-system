import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function nextConfig(phase: string): NextConfig {
  return {
    output: 'export',
    images: {
      unoptimized: true,
    },
    trailingSlash: true,
    ...(phase === PHASE_DEVELOPMENT_SERVER
      ? {
          async rewrites() {
            return [
              {
                source: '/api/:path*',
                destination: 'http://localhost:5000/:path*',
              },
            ];
          },
        }
      : {}),
  };
}
