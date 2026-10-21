import type { NextConfig } from "next";

// Every page here depends on the signed-in user, so pages render per request.
// Cache Components stays off until we adopt it deliberately (see Next.js docs:
// guides/authentication-with-cache-components).
const nextConfig: NextConfig = {
  // Wiki pages are read from content/wiki at request time.
  outputFileTracingIncludes: { "/wiki": ["./content/wiki/**/*"], "/wiki/*": ["./content/wiki/**/*"] },
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
