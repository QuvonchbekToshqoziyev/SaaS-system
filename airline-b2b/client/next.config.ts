import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Static export only for production builds; dev needs a normal server
    // so static assets (logo, etc.) and API requests behave correctly.
    ...(isDev ? {} : { output: 'export' as const }),
    images: {
      unoptimized: true,
    },
    trailingSlash: true,
  };
}
