//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3001';

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  async rewrites() {
    return [
      { source: '/api/graphql', destination: `${gatewayUrl}/graphql` },
      { source: '/api/auth/:path*', destination: `${authUrl}/auth/:path*` },
    ];
  },
};

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
