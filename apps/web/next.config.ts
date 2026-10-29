import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@cleanconnect/shared"],
  cacheComponents: true,
  partialPrefetching: true,
  // In-app photos are posted to a server action (resized to <= 1600px on the device first).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
