import type { NextConfig } from "next";
import { securityHeaders } from "./src/server/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: process.env.QRONUS_STANDALONE === "1" ? "standalone" : undefined,
  // Fonts read via fs at runtime for PDF posters must ship with the server bundle.
  outputFileTracingIncludes: {
    "/api/app/poster": ["./src/components/app/fonts/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/:key([A-Za-z0-9-]{8,128}).txt", destination: "/api/indexnow/key?key=:key" }];
  },
};

export default nextConfig;
