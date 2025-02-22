import { CONFIG } from './src/constants/config';
import withPWA from 'next-pwa';
import withBundleAnalyzer from '@next/bundle-analyzer';

// Check if bundle analysis is enabled
const ANALYZE = process.env.ANALYZE === 'true';

/**
 * Generates comprehensive Content Security Policy rules
 * @returns {string} Formatted CSP policy string
 */
const generateCSP = (): string => {
  const policy = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'", // Required for Next.js
      "'unsafe-eval'", // Required for Next.js
      'js.stripe.com', // Payment processing
      '*.google-analytics.com'
    ],
    'connect-src': [
      "'self'",
      CONFIG.API.BASE_URL,
      CONFIG.SOCKET.URL,
      'api.stripe.com',
      '*.google-analytics.com'
    ],
    'media-src': [
      "'self'",
      'storage.videocoach.com',
      'cdn.videocoach.com',
      'blob:' // For local video processing
    ],
    'frame-ancestors': ["'self'"],
    'img-src': [
      "'self'",
      'data:',
      'storage.videocoach.com',
      'cdn.videocoach.com',
      '*.stripe.com'
    ],
    'style-src': ["'self'", "'unsafe-inline'"], // Required for styled-components
    'worker-src': ["'self'", 'blob:'], // For service worker and video processing
    'font-src': ["'self'", 'data:', 'fonts.gstatic.com'],
    'frame-src': ["'self'", 'js.stripe.com']
  };

  return Object.entries(policy)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
};

// Configure bundle analyzer
const withBundleAnalyzerConfig = withBundleAnalyzer({
  enabled: ANALYZE
});

// Configure PWA
const withPWAConfig = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: '^https://storage\\.videocoach\\.com/.*',
      handler: 'CacheFirst',
      options: {
        cacheName: 'video-content',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 86400 // 24 hours
        }
      }
    }
  ]
});

// Next.js configuration
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  },

  // Image optimization configuration
  images: {
    domains: ['storage.videocoach.com', 'cdn.videocoach.com'],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    quality: 85
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=self, microphone=self, geolocation=self'
          },
          {
            key: 'Content-Security-Policy',
            value: generateCSP()
          }
        ]
      }
    ];
  },

  // Webpack configuration
  webpack: (config, { dev, isServer }) => {
    // Optimization settings
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        cacheGroups: {
          vendor: {
            test: /node_modules/,
            name: 'vendors',
            chunks: 'all'
          }
        }
      },
      minimize: !dev,
      minimizer: [...(config.optimization.minimizer || []), 'terser']
    };

    // Performance hints
    if (!dev && !isServer) {
      config.performance = {
        hints: 'warning',
        maxEntrypointSize: 400000,
        maxAssetSize: 400000
      };
    }

    return config;
  }
};

// Export configured Next.js with PWA and Bundle Analyzer
export default withBundleAnalyzerConfig(withPWAConfig(nextConfig));