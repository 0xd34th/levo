import type { NextConfig } from 'next';
import path from 'path';

for (const envVar of ['NEXT_PUBLIC_PRIVY_APP_ID'] as const) {
  const value = process.env[envVar];
  if (!value || value.trim() === '') {
    throw new Error(`${envVar} is required`);
  }
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
};

export default nextConfig;
