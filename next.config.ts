import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // unpdf loads its PDF.js build with a runtime import and resolves PDF.js assets with import.meta.resolve: run it
  // with Node's own module loader, as in the unit tests, instead of bundling it.
  serverExternalPackages: ["unpdf"],
  // /api/extract reads the committed extraction fixtures from disk (fixtures/ is not in public/), and the external
  // unpdf package must ship with the function.
  outputFileTracingIncludes: {
    "/api/extract": [
      "./fixtures/extraction/*.json",
      "./node_modules/unpdf/package.json",
      "./node_modules/unpdf/dist/*.mjs",
      "./node_modules/unpdf/dist/*.cjs",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
