'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { PromoTile } from '@/components/promo-card';

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  body: string;
  tile?: PromoTile;
  href?: string;
  externalHref?: string;
  onClick?: () => void;
}

const tileColor: Record<Exclude<PromoTile, 'none'>, string> = {
  green: 'var(--tile-green)',
  blue: 'var(--tile-blue)',
  ink: 'var(--tile-ink)',
};

/**
 * v3 FeatureGrid — two-up compact cards, icon badge above title + body.
 * Used for "Get started" discovery rows.
 */
export function FeatureGrid({ items }: { items: FeatureItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) => {
        const content = (
          <>
            <span
              className="flex size-8 items-center justify-center rounded-[9px] text-white"
              style={{
                background:
                  item.tile === 'none'
                    ? 'var(--raise)'
                    : tileColor[(item.tile ?? 'ink') as Exclude<PromoTile, 'none'>],
                color: item.tile === 'none' ? 'var(--foreground)' : '#ffffff',
              }}
            >
              <item.icon className="size-[18px]" strokeWidth={1.8} />
            </span>
            <div className="mt-[18px] text-[16px] font-semibold tracking-[-0.005em]">
              {item.title}
            </div>
            <div
              className="mt-1 text-[13.5px] leading-[1.35]"
              style={{ color: 'var(--text-mute)' }}
            >
              {item.body}
            </div>
          </>
        );

        const className =
          'flex min-h-[148px] flex-col rounded-[18px] bg-surface px-4 py-[18px] text-left transition-colors hover:bg-raise';

        if (item.href) {
          return (
            <Link key={item.title} href={item.href} className={className}>
              {content}
            </Link>
          );
        }
        if (item.externalHref) {
          return (
            <a
              key={item.title}
              href={item.externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className={className}
            >
              {content}
            </a>
          );
        }
        if (item.onClick) {
          return (
            <button
              key={item.title}
              type="button"
              className={className}
              onClick={item.onClick}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={item.title} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
