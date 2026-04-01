'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ActionItem {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ActionButtonRowProps {
  depositHref?: string;
  showClaim?: boolean;
  onClaim?: () => void;
}

export function ActionButtonRow({ depositHref, showClaim, onClaim }: ActionButtonRowProps) {
  const actions: ActionItem[] = [
    { icon: ArrowDownLeft, label: 'Deposit', href: depositHref },
    { icon: ArrowUpRight, label: 'Send', href: '/send' },
  ];

  if (showClaim) {
    actions.push({ icon: Sparkles, label: 'Claim', onClick: onClaim });
  }

  return (
    <div className="flex items-center justify-center gap-6">
      {actions.map((action) => {
        const content = (
          <>
            <span className="flex size-12 items-center justify-center rounded-full border border-border/60 bg-secondary/50 transition-colors hover:bg-secondary dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10">
              <action.icon className="size-5 text-foreground" />
            </span>
            <span className="mt-1.5 text-xs font-medium text-muted-foreground">
              {action.label}
            </span>
          </>
        );

        if (action.href) {
          return (
            <Link key={action.label} href={action.href} className="flex flex-col items-center">
              {content}
            </Link>
          );
        }

        return (
          <button key={action.label} type="button" className="flex flex-col items-center" onClick={action.onClick}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
