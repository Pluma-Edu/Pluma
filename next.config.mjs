/** @type {import('next').NextConfig} */
const nextConfig = {
  // playwright-core is only used by the render service; never bundle it
  serverExternalPackages: ['playwright-core', 'pg'],
};
export default nextConfig;
