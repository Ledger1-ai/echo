import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Transpile thirdweb so Next bundles its modules properly (prevents dev 404s to /src/react/... paths)
  transpilePackages: [
    "thirdweb",
    "lucide-react",
    "@radix-ui/react-dialog",
    "@radix-ui/react-tooltip",
    "@radix-ui/react-portal",
    "@radix-ui/react-presence",
    "@radix-ui/react-primitive",
    "@radix-ui/react-focus-scope",
    "@radix-ui/react-popper",
    "@floating-ui/react-dom"
  ],
  serverExternalPackages: ["@apollo/server", "graphql"],
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  typescript: {
    // Ignore TypeScript type errors during production builds
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
