import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.HANSFIELD_TEST_MODE === "1" ? ".next-test" : ".next",
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/film/process": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*",
    ],
    "/api/health": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./artifacts/**/*",
      "./tests/**/*",
      "./data/**/*",
      "./**/*.sqlite*",
      "./.env*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
