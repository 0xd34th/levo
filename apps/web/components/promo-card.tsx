'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

interface PromoCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  href?: string;
  externalHref?: string;
  onClick?: () => void;
}

const cardClasses =
  'flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:bg-secondary/30 dark:border-white/8 dark:hover:bg-white/4';

function CardContent({
  icon: Icon,
  title,
  description,
  action,
  showChevron,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  showChevron?: boolean;
}) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-foreground dark:bg-white/6">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {action ?? (showChevron ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null)}
    </>
  );
}

export function PromoCard({ icon, title, description, action, href, externalHref, onClick }: PromoCardProps) {
  const content = (
    <CardContent
      icon={icon}
      title={title}
      description={description}
      action={action}
      showChevron={Boolean(href || externalHref || onClick)}
    />
  );

  if (href) {
    return (
      <Link href={href} className={cardClasses}>
        {content}
      </Link>
    );
  }

  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer" className={cardClasses}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={cardClasses} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}
