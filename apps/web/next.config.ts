import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@cleanconnect/shared"],
  cacheComponents: true,
  partialPrefetching: true,
  // In-app photos (resized to <= 1600px on the device first) and CAC certificates (up to 5 MB) are posted to
  // server actions; the limit leaves room for the rest of the form.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
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
