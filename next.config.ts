import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the tracing root to this project so Next.js does not pick up the
  // parent workspace's middleware or config files.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
