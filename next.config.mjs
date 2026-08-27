import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  // Hostinger Web Apps builds from source and starts the app with
  // `npm start` (next start), so no standalone output is needed.
  poweredByHeader: false,
  // mysql2 opens TCP sockets and hashes with node:crypto, so it is loaded by
  // Node directly rather than bundled.
  serverExternalPackages: ['mysql2'],
  compress: true,
  experimental: {
    // AppIcon does `import * as HeroIcons` so it can resolve names at
    // runtime. Without this, that namespace import drags the entire icon set
    // into every client bundle; this rewrites it to per-icon imports.
    optimizePackageImports: ['@heroicons/react/24/outline', '@heroicons/react/24/solid'],
  },
  distDir: process.env.DIST_DIR || '.next',
  typescript: {
    // Type errors now fail the build. The whole order pipeline is typed
    // end to end, so a broken build is better than a broken checkout.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
    qualities: [75, 85, 100],
  },
  webpack(
    config,
    {
      dev: dev
    }
  ) {
    if (dev) {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: [/node_modules/],
        use: [{
          loader: '@dhiwise/component-tagger/nextLoader',
        }],
      });
      const ignoredPaths = (process.env.WATCH_IGNORED_PATHS || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      config.watchOptions = {
        ignored: ignoredPaths.length
          ? ignoredPaths.map((p) => `**/${p.replace(/^\/+|\/+$/g, '')}/**`)
          : undefined,
      };
    }
    return config;
  },
};
export default nextConfig;