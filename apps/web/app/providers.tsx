'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ThemeProvider, useTheme } from 'next-themes';

function PrivyThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
  const privyTheme = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['twitter'],
        appearance: {
          theme: privyTheme,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <PrivyThemeProvider>
        {children}
      </PrivyThemeProvider>
    </ThemeProvider>
  );
}
