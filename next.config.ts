import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/:key([A-Za-z0-9-]{8,128}).txt", destination: "/api/indexnow/key?key=:key" }];
  },
};

export default nextConfig;
