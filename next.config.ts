import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Bundle YAML data files with each serverless function (needed on Vercel)
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
  },
  webpack: (config) => {
    // pdfjs-dist référence le module Node optionnel « canvas », inutile côté
    // navigateur ; on l'exclut pour éviter un échec de bundle.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...(config.resolve.alias ?? {}), canvas: false };
    return config;
  },
};

export default nextConfig;
