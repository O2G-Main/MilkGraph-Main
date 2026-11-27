import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      { source: "/alur", destination: "/produksi", permanent: true },
      { source: "/kondisi-alat", destination: "/alat", permanent: true },
    ];
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    disable: true,
  },
  telemetry: false,
});
