'use client';

import { ThemeProvider } from 'next-themes';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { dAppKit } from '@/lib/dapp-kit';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>
    </ThemeProvider>
  );
}
