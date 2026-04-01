'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/', label: 'Account', match: (p: string) => p === '/' },
  { href: '/activity', label: 'Activity', match: (p: string) => p.startsWith('/activity') },
  { href: '/tools', label: 'Tools', match: (p: string) => p.startsWith('/tools') },
];

export function SegmentedTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 p-1 dark:border-white/8 dark:bg-white/4">
      {tabs.map((tab) => {
        const active = tab.match(pathname);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex-1 rounded-full py-2 text-center text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm dark:bg-white/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
