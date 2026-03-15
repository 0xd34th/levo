'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

function subscribe() {
  return () => {};
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const activeTheme = resolvedTheme ?? 'dark';

  if (!isClient) {
    return (
      <Button variant="ghost" size="icon" className="size-9" disabled>
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      onClick={() => setTheme(activeTheme === 'dark' ? 'light' : 'dark')}
      aria-label={activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {activeTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
