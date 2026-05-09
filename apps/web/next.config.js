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
  // AI copilot mutations can take 15-60s while the LLM runs tool-calls;
  // raise the proxy timeout above Next's 30s default so the response
  // doesn't get cut off mid-flight.
  experimental: {
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      { source: '/api/graphql', destination: `${gatewayUrl}/graphql` },
      { source: '/api/auth/:path*', destination: `${authUrl}/auth/:path*` },
    ];
  },
};

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
