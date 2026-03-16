'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard/sent', label: 'Sent', icon: Send },
  { href: '/dashboard/received', label: 'Received', icon: Inbox },
];

export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="mt-8 inline-flex w-fit items-center gap-1 rounded-full border border-border/70 bg-background/88 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-white/8 dark:bg-white/4 dark:shadow-none">
      {tabs.map((tab) => {
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm dark:bg-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                : 'text-secondary-foreground hover:bg-secondary/90 hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/6',
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
