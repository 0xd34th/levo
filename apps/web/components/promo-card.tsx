'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PromoTile = 'green' | 'blue' | 'ink' | 'none';

interface PromoCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  href?: string;
  externalHref?: string;
  onClick?: () => void;
  tile?: PromoTile;
}

const cardClass =
  'flex w-full items-start gap-3.5 rounded-[18px] bg-surface px-4 py-4 text-left transition-colors hover:bg-raise';

const tileColor: Record<Exclude<PromoTile, 'none'>, string> = {
  green: 'var(--tile-green)',
  blue: 'var(--tile-blue)',
  ink: 'var(--tile-ink)',
};

function CardBody({
  icon: Icon,
  title,
  description,
  action,
  showChevron,
  tile = 'green',
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  showChevron?: boolean;
  tile?: PromoTile;
}) {
  return (
    <>
      {tile !== 'none' ? (
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white"
          style={{ background: tileColor[tile] }}
        >
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
      ) : (
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-raise">
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold tracking-[-0.01em] leading-tight">
          {title}
        </p>
        <p
          className="mt-1 text-[14px] leading-[1.38]"
          style={{ color: 'var(--text-soft)' }}
        >
          {description}
        </p>
      </div>
      {action ?? (
        showChevron ? (
          <ChevronRight
            className="mt-2 size-[18px] shrink-0"
            style={{ color: 'var(--text-mute)' }}
            strokeWidth={1.8}
          />
        ) : null
      )}
    </>
  );
}

export function PromoCard({
  icon,
  title,
  description,
  action,
  href,
  externalHref,
  onClick,
  tile = 'green',
}: PromoCardProps) {
  const body = (
    <CardBody
      icon={icon}
      title={title}
      description={description}
      action={action}
      showChevron={Boolean(href || externalHref || onClick)}
      tile={tile}
    />
  );

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    );
  }

  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer" className={cardClass}>
        {body}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={cardClass} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={cn(cardClass, 'cursor-default')}>{body}</div>;
}
