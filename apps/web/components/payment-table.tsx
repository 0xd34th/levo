'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';
import { cn } from '@/lib/utils';

export interface PaymentTableRow {
  id: string;
  counterpartyLabel: string;
  counterpartySubLabel?: string;
  counterpartyAvatarUrl?: string | null;
  amount: string;
  status: string;
  claimStatus?: string;
  date: string;
  txUrl?: string | null;
}

interface PaymentTableProps {
  counterpartyColumnLabel: string;
  rows: PaymentTableRow[];
  emptyTitle: string;
  emptyDescription: string;
  enableVirtualization?: boolean;
  showClaimStatus?: boolean;
  showTxLink?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const VIRTUALIZATION_THRESHOLD = 40;
const VIRTUAL_OVERSCAN = 6;
const MOBILE_VIEWPORT_HEIGHT = 440;
const MOBILE_ROW_HEIGHT = 132;
const DESKTOP_VIEWPORT_HEIGHT = 560;
const DESKTOP_ROW_HEIGHT = 74;

function getVisibleWindow(
  rowCount: number,
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
) {
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN,
  );
  const endIndex = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + VIRTUAL_OVERSCAN,
  );

  return {
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * rowHeight,
    bottomSpacerHeight: Math.max(0, (rowCount - endIndex) * rowHeight),
  };
}

function badgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  const normalized = status.toLowerCase();

  if (normalized.includes('claim') || normalized.includes('pending')) {
    return 'secondary';
  }

  if (normalized.includes('confirmed') || normalized.includes('available')) {
    return 'default';
  }

  return 'outline';
}

export function PaymentTable({
  counterpartyColumnLabel,
  rows,
  emptyTitle,
  emptyDescription,
  enableVirtualization = false,
  showClaimStatus = false,
  showTxLink = false,
}: PaymentTableProps) {
  const [mobileScrollTop, setMobileScrollTop] = useState(0);
  const [desktopScrollTop, setDesktopScrollTop] = useState(0);

  if (rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-border/70 bg-secondary/60 px-6 py-10 text-center dark:border-white/10 dark:bg-white/4">
        <p className="text-lg font-semibold tracking-[-0.03em]">{emptyTitle}</p>
        <p className="mt-2 text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  const shouldVirtualize = enableVirtualization && rows.length > VIRTUALIZATION_THRESHOLD;
  const mobileWindow = shouldVirtualize
    ? getVisibleWindow(
        rows.length,
        mobileScrollTop,
        MOBILE_ROW_HEIGHT,
        MOBILE_VIEWPORT_HEIGHT,
      )
    : null;
  const desktopWindow = shouldVirtualize
    ? getVisibleWindow(
        rows.length,
        desktopScrollTop,
        DESKTOP_ROW_HEIGHT,
        DESKTOP_VIEWPORT_HEIGHT,
      )
    : null;
  const visibleMobileRows = mobileWindow
    ? rows.slice(mobileWindow.startIndex, mobileWindow.endIndex)
    : rows;
  const visibleDesktopRows = desktopWindow
    ? rows.slice(desktopWindow.startIndex, desktopWindow.endIndex)
    : rows;
  const desktopColSpan = 4 + (showClaimStatus ? 1 : 0) + (showTxLink ? 1 : 0);

  const renderMobileRow = (row: PaymentTableRow) => (
    <div
      key={row.id}
      className="rounded-[24px] border border-border/70 bg-background/80 p-4 dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-11 border-border/60 dark:border-white/8">
          {row.counterpartyAvatarUrl && isTrustedProfilePictureUrl(row.counterpartyAvatarUrl) ? (
            <AvatarImage alt={row.counterpartyLabel} src={row.counterpartyAvatarUrl} />
          ) : null}
          <AvatarFallback>{row.counterpartyLabel.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{row.counterpartyLabel}</p>
          {row.counterpartySubLabel ? (
            <p className="truncate text-xs text-muted-foreground">
              {row.counterpartySubLabel}
            </p>
          ) : null}
        </div>
        <p className="text-sm font-semibold">{row.amount}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant={badgeVariant(row.status)} className="rounded-full">
          {row.status}
        </Badge>
        {row.claimStatus ? (
          <Badge variant={badgeVariant(row.claimStatus)} className="rounded-full">
            {row.claimStatus}
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {dateFormatter.format(new Date(row.date))}
        </span>
        {row.txUrl ? (
          <Link
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            href={row.txUrl}
            rel="noreferrer"
            target="_blank"
          >
            View tx
            <ExternalLink className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );

  const renderDesktopRow = (row: PaymentTableRow) => (
    <TableRow key={row.id}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-10 border-border/60 dark:border-white/8">
            {row.counterpartyAvatarUrl && isTrustedProfilePictureUrl(row.counterpartyAvatarUrl) ? (
              <AvatarImage alt={row.counterpartyLabel} src={row.counterpartyAvatarUrl} />
            ) : null}
            <AvatarFallback>
              {row.counterpartyLabel.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.counterpartyLabel}</p>
            {row.counterpartySubLabel ? (
              <p className="truncate text-xs text-muted-foreground">
                {row.counterpartySubLabel}
              </p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="font-medium">{row.amount}</TableCell>
      <TableCell>
        <Badge
          variant={badgeVariant(row.status)}
          className={cn('rounded-full', row.status === 'Confirmed' ? 'bg-accent text-accent-foreground' : '')}
        >
          {row.status}
        </Badge>
      </TableCell>
      {showClaimStatus ? (
        <TableCell>
          {row.claimStatus ? (
            <Badge variant={badgeVariant(row.claimStatus)} className="rounded-full">
              {row.claimStatus}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
      ) : null}
      <TableCell className="text-muted-foreground">
        {dateFormatter.format(new Date(row.date))}
      </TableCell>
      {showTxLink ? (
        <TableCell className="text-right">
          {row.txUrl ? (
            <Link
              className="inline-flex items-center gap-1 text-primary"
              href={row.txUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open
              <ExternalLink className="size-3.5" />
            </Link>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
      ) : null}
    </TableRow>
  );

  return (
    <>
      {shouldVirtualize ? (
        <div
          className="overflow-y-auto pr-1 md:hidden"
          onScroll={(event) => setMobileScrollTop(event.currentTarget.scrollTop)}
          style={{ height: MOBILE_VIEWPORT_HEIGHT }}
        >
          {mobileWindow && mobileWindow.topSpacerHeight > 0 ? (
            <div style={{ height: mobileWindow.topSpacerHeight }} />
          ) : null}
          <div className="space-y-3">
            {visibleMobileRows.map(renderMobileRow)}
          </div>
          {mobileWindow && mobileWindow.bottomSpacerHeight > 0 ? (
            <div style={{ height: mobileWindow.bottomSpacerHeight }} />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 md:hidden">
          {rows.map(renderMobileRow)}
        </div>
      )}

      <div className="hidden md:block">
        <div
          className={shouldVirtualize ? 'overflow-y-auto' : undefined}
          onScroll={
            shouldVirtualize
              ? (event) => setDesktopScrollTop(event.currentTarget.scrollTop)
              : undefined
          }
          style={shouldVirtualize ? { height: DESKTOP_VIEWPORT_HEIGHT } : undefined}
        >
          <Table>
            <TableHeader className={shouldVirtualize ? 'sticky top-0 z-10 bg-card/95 supports-[backdrop-filter]:backdrop-blur dark:bg-[#11161d]/95' : undefined}>
              <TableRow className="hover:bg-transparent">
                <TableHead>{counterpartyColumnLabel}</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                {showClaimStatus ? <TableHead>Claim Status</TableHead> : null}
                <TableHead>Date</TableHead>
                {showTxLink ? <TableHead className="text-right">Tx</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {desktopWindow && desktopWindow.topSpacerHeight > 0 ? (
                <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                  <TableCell
                    className="p-0"
                    colSpan={desktopColSpan}
                    style={{ height: desktopWindow.topSpacerHeight }}
                  />
                </TableRow>
              ) : null}
              {(shouldVirtualize ? visibleDesktopRows : rows).map(renderDesktopRow)}
              {desktopWindow && desktopWindow.bottomSpacerHeight > 0 ? (
                <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                  <TableCell
                    className="p-0"
                    colSpan={desktopColSpan}
                    style={{ height: desktopWindow.bottomSpacerHeight }}
                  />
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
