import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @bridou/shared ships raw TypeScript; Next compiles it in place
  transpilePackages: ['@bridou/shared'],
  // The root .eslintrc.cjs belongs to the legacy Qwik app; don't let it break builds
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
