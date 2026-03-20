import type { NextConfig } from "next";
import path from "path";

const SECURITY_HEADERS = [
  // Prevent the app from being embedded in iframes (clickjacking protection)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer info sent to third-party sites
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features this app doesn't use
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Tell browsers to always use HTTPS (2 years)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Disable DNS prefetching for privacy
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // Force XSS filter in older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },
];

const nextConfig: NextConfig = {
  // Pin the tracing root to this project so Next.js does not pick up the
  // parent workspace's middleware or config files.
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['playwright'],

  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;

