import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 140, 160, 200, 256, 384],
  },
};

export default withPWA(nextConfig);
