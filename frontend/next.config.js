/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'localhost',
      's3.amazonaws.com',
      'gamemarket.tn',
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.s3.amazonaws.com',
      },
    ],
  },
  
  // SEO optimizations
  trailingSlash: false,
  poweredByHeader: false,
  
  // Redirects
  async redirects() {
    return [
      {
        source: '/old-path/:path*',
        destination: '/new-path/:path*',
        permanent: true,
      },
    ];
  },

  // Headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;