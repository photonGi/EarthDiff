import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "geotiff"],
  experimental: {
    optimizePackageImports: ["maplibre-gl", "motion"],
  },
};

export default nextConfig;
