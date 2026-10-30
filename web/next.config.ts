import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin Turbopack root to this app (where `next` is installed). Prevents
  // "Next.js package not found" during HMR when the inferred root is wrong.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
