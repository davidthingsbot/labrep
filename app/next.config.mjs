/** @type {import('next').NextConfig} */

// For GitHub Pages deployment, set NEXT_PUBLIC_BASE_PATH=/labrep
// For local development, leave unset or empty
const isGitHubPages = process.env.NEXT_PUBLIC_BASE_PATH === '/labrep';
const basePath = isGitHubPages ? '/labrep' : '';

const nextConfig = {
  output: 'export',
  // Only set basePath/assetPrefix when deploying to GitHub Pages
  ...(isGitHubPages && {
    basePath: '/labrep',
    assetPrefix: '/labrep',
  }),
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@labrep/generation'],
};

export default nextConfig;
