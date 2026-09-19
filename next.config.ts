import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages include the serverless Chromium runtime and must remain
  // external to Next.js' normal server bundle.
  serverExternalPackages: [
    "@sparticuz/chromium-min",
    "puppeteer-core",
  ],
};

export default nextConfig;
