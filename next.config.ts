import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the landing's screenshots are served resized and in modern formats
  images: {
    formats: ["image/avif", "image/webp"],
    // Next 16 serves only quality 75 unless told otherwise; the landing's
    // photographs ask for 90, so they are not softened on a large screen
    qualities: [75, 90],
  },
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
