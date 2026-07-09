import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // workspace packages ship raw TypeScript; Next compiles them in place
  transpilePackages: ['@bridou/shared', '@bridou/cards-ui'],
  // The root .eslintrc.cjs belongs to the legacy Qwik app; don't let it break builds
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
