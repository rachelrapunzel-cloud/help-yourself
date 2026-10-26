import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page shows live stock and order state, so nothing is cached.
  cacheComponents: false,
  // PGlite (local dev database) must load its WASM from node_modules, not the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
