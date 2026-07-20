import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker builds trace a minimal server into .next/standalone (~10x smaller
  // image); Vercel ignores standalone, but gating on DOCKER_BUILD keeps local
  // `pnpm build` output identical to what `pnpm start` expects.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // The dashboard cookie lives 30 days and SameSite=Lax does not stop the
  // page being framed - without these an attacker can iframe the logged-in
  // dashboard and clickjack Approve/Merge/Delete buttons.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
