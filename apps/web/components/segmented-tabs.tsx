'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/', label: 'Account', match: (p: string) => p === '/' },
  { href: '/activity', label: 'Activity', match: (p: string) => p.startsWith('/activity') },
  { href: '/tools', label: 'Tools', match: (p: string) => p.startsWith('/tools') },
];

/**
 * v3 pill tabs — the signature X Money element.
 * Surface-gray inactive, near-black filled active.
 */
export function SegmentedTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="no-scrollbar flex items-center gap-2 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.match(pathname);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full px-5 py-2.5 text-[15px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'bg-surface text-foreground hover:bg-raise',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
