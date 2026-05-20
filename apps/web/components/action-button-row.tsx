'use client';

import Link from 'next/link';
import { ArrowDownToLine, ArrowUpRight, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ActionItem {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ActionButtonRowProps {
  depositHref?: string;
}

/**
 * v3 QuickTiles — three surface-gray squares with a confident line icon above the label.
 * Deposit / Send / Earn ordering is load-bearing for tests and muscle memory.
 */
export function ActionButtonRow({ depositHref }: ActionButtonRowProps) {
  const actions: ActionItem[] = [
    { icon: ArrowDownToLine, label: 'Deposit', href: depositHref },
    { icon: ArrowUpRight, label: 'Send', href: '/send' },
    { icon: Sparkles, label: 'Earn', href: '/earn' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {actions.map((action) => {
        const tile = (
          <span className="flex size-[26px] items-center justify-center">
            <action.icon className="size-[26px]" strokeWidth={1.8} />
          </span>
        );
        const label = (
          <span
            className="text-[15px] font-medium"
            style={{ letterSpacing: '-0.005em' }}
          >
            {action.label}
          </span>
        );

        const className =
          'flex flex-col items-center justify-center gap-3 rounded-[18px] bg-surface py-5 transition-colors hover:bg-raise';

        if (action.href) {
          return (
            <Link key={action.label} href={action.href} className={className}>
              {tile}
              {label}
            </Link>
          );
        }

        return (
          <button
            key={action.label}
            type="button"
            className={className}
            onClick={action.onClick}
          >
            {tile}
            {label}
          </button>
        );
      })}
    </div>
  );
}
