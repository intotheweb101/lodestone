import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'stream-json', 'stream-chain'],
};

export default nextConfig;
