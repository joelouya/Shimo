import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * The poster renderer reads its two typefaces off disk when it starts.
   * Nothing imports them, so the build's file tracer has no reason to ship
   * them alongside the function: the route would work perfectly in development
   * and throw ENOENT the first time a club asked for a poster in production.
   */
  outputFileTracingIncludes: {
    "/api/poster": ["./assets/fonts/**"],
  },
};

export default nextConfig;
