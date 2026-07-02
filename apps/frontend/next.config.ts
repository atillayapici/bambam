import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow colyseus.js & pixi.js to be bundled
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Webpack config to handle pixi.js properly
  webpack: (config) => {
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
