import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Development only: lets the dev server be opened as 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
