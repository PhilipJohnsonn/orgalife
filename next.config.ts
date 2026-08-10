import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Leaves multipart overhead above the route's explicit 10 MiB PDF limit.
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
