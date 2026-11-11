/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@nimphy/ai',
    '@nimphy/calc-engine',
    '@nimphy/documents',
    '@nimphy/domain',
    '@nimphy/payments',
    '@nimphy/persistence',
    '@nimphy/rules',
  ],
};

export default nextConfig;
