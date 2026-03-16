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
      <Button
        variant="ghost"
        size="icon"
        className="size-9 rounded-full border border-border/80 bg-background/92 text-secondary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
        disabled
      >
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9 rounded-full border border-border/80 bg-background/92 text-secondary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:bg-secondary hover:text-foreground"
      onClick={() => setTheme(activeTheme === 'dark' ? 'light' : 'dark')}
      aria-label={activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {activeTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
