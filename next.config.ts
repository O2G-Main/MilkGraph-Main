import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [{ source: "/alur", destination: "/produksi", permanent: true }];
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
