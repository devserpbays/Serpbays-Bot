import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the tracing root to this project so Next.js does not pick up the
  // parent workspace's middleware or config files.
  outputFileTracingRoot: path.join(__dirname),

  // Proxy API calls to the remote backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://88.222.214.19:3005/api/:path*',
      },
    ];
  },
};

export default nextConfig;

