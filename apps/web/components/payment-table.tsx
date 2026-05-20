'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  date: string;
  txUrl?: string | null;
  direction?: 'incoming' | 'outgoing';
}

interface PaymentTableProps {
  counterpartyColumnLabel: string;
  rows: PaymentTableRow[];
  emptyTitle: string;
  emptyDescription: string;
  enableVirtualization?: boolean;
  showTxLink?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});
const VIRTUALIZATION_THRESHOLD = 40;
const VIRTUAL_OVERSCAN = 6;
const MOBILE_VIEWPORT_HEIGHT = 440;
const MOBILE_ROW_HEIGHT = 64;
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

function formatAmountWithSign(row: PaymentTableRow) {
  const amount = row.amount.trim();
  if (!amount) return { value: amount, sign: '' };

  const alreadySigned = amount.startsWith('+') || amount.startsWith('-') || amount.startsWith('−');
  if (alreadySigned) return { value: amount, sign: '' };

  if (row.direction === 'incoming') return { value: amount, sign: '+' };
  if (row.direction === 'outgoing') return { value: amount, sign: '−' };
  return { value: amount, sign: '' };
}

function amountColor(row: PaymentTableRow) {
  if (row.direction === 'incoming') return 'var(--up)';
  return 'var(--foreground)';
}

export function PaymentTable({
  counterpartyColumnLabel,
  rows,
  emptyTitle,
  emptyDescription,
  enableVirtualization = false,
  showTxLink = false,
}: PaymentTableProps) {
  const [mobileScrollTop, setMobileScrollTop] = useState(0);
  const [desktopScrollTop, setDesktopScrollTop] = useState(0);

  if (rows.length === 0) {
    return (
      <div className="rounded-[18px] bg-surface px-6 py-10 text-center">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">{emptyTitle}</p>
        <p className="mt-2 text-[14px]" style={{ color: 'var(--text-soft)' }}>
          {emptyDescription}
        </p>
      </div>
    );
  }

  const shouldVirtualize = enableVirtualization && rows.length > VIRTUALIZATION_THRESHOLD;
  const mobileWindow = shouldVirtualize
    ? getVisibleWindow(rows.length, mobileScrollTop, MOBILE_ROW_HEIGHT, MOBILE_VIEWPORT_HEIGHT)
    : null;
  const desktopWindow = shouldVirtualize
    ? getVisibleWindow(rows.length, desktopScrollTop, DESKTOP_ROW_HEIGHT, DESKTOP_VIEWPORT_HEIGHT)
    : null;
  const visibleMobileRows = mobileWindow
    ? rows.slice(mobileWindow.startIndex, mobileWindow.endIndex)
    : rows;
  const visibleDesktopRows = desktopWindow
    ? rows.slice(desktopWindow.startIndex, desktopWindow.endIndex)
    : rows;
  const desktopColSpan = 4;

  const renderMobileRow = (row: PaymentTableRow, index: number) => {
    const { value, sign } = formatAmountWithSign(row);
    const color = amountColor(row);
    const content = (
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3.5',
          index !== 0 ? 'border-t border-[color:var(--border)]' : null,
        )}
      >
        <Avatar className="size-9 shrink-0 border-0 bg-raise">
          {row.counterpartyAvatarUrl && isTrustedProfilePictureUrl(row.counterpartyAvatarUrl) ? (
            <AvatarImage alt={row.counterpartyLabel} src={row.counterpartyAvatarUrl} />
          ) : null}
          <AvatarFallback className="bg-transparent text-[11px] font-semibold">
            {row.counterpartyLabel.replace(/^@/, '').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{row.counterpartyLabel}</p>
          <p className="mt-0.5 truncate text-[13px]" style={{ color: 'var(--text-mute)' }}>
            {dateFormatter.format(new Date(row.date))}
            {row.counterpartySubLabel ? ` · ${row.counterpartySubLabel}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono-nums text-[15px] font-semibold" style={{ color }}>
            {sign}
            {value}
          </div>
          <div
            className="mono-nums mt-1 text-[11px]"
            style={{ color: 'var(--text-fade)', letterSpacing: '0.04em' }}
          >
            {row.status.toUpperCase()}
          </div>
        </div>
      </div>
    );

    if (showTxLink && row.txUrl) {
      return (
        <Link
          key={row.id}
          href={row.txUrl}
          rel="noreferrer"
          target="_blank"
          className="block transition-colors hover:bg-raise"
          style={{ borderTop: index !== 0 ? undefined : 'none' }}
        >
          {content}
        </Link>
      );
    }

    return (
      <div key={row.id}>
        {content}
      </div>
    );
  };

  const renderDesktopRow = (row: PaymentTableRow) => {
    const { value, sign } = formatAmountWithSign(row);
    const color = amountColor(row);
    return (
      <TableRow key={row.id}>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border-0 bg-raise">
              {row.counterpartyAvatarUrl && isTrustedProfilePictureUrl(row.counterpartyAvatarUrl) ? (
                <AvatarImage alt={row.counterpartyLabel} src={row.counterpartyAvatarUrl} />
              ) : null}
              <AvatarFallback className="bg-transparent text-xs font-semibold">
                {row.counterpartyLabel.replace(/^@/, '').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.counterpartyLabel}</p>
              {row.counterpartySubLabel ? (
                <p className="truncate text-xs" style={{ color: 'var(--text-mute)' }}>
                  {row.counterpartySubLabel}
                </p>
              ) : null}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <span className="mono-nums text-sm font-semibold" style={{ color }}>
            {sign}
            {value}
          </span>
        </TableCell>
        <TableCell>
          <span className="mono-nums text-xs tracking-[0.04em]" style={{ color: 'var(--text-mute)' }}>
            {row.status.toUpperCase()}
          </span>
        </TableCell>
        <TableCell>
          <span className="mono-nums text-sm" style={{ color: 'var(--text-mute)' }}>
            {dateFormatter.format(new Date(row.date))}{' · '}
            {timeFormatter.format(new Date(row.date))}
          </span>
          {showTxLink && row.txUrl ? (
            <Link
              className="ml-2 inline-flex items-center text-xs"
              href={row.txUrl}
              rel="noreferrer"
              target="_blank"
              style={{ color: 'var(--text-mute)' }}
            >
              <ArrowUpRight className="size-3" />
            </Link>
          ) : null}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      {shouldVirtualize ? (
        <div
          className="scrollbar-subtle overflow-y-auto rounded-[18px] bg-surface md:hidden"
          onScroll={(event) => setMobileScrollTop(event.currentTarget.scrollTop)}
          style={{ height: MOBILE_VIEWPORT_HEIGHT }}
        >
          {mobileWindow && mobileWindow.topSpacerHeight > 0 ? (
            <div style={{ height: mobileWindow.topSpacerHeight }} />
          ) : null}
          <div>
            {visibleMobileRows.map((row, idx) => renderMobileRow(row, idx))}
          </div>
          {mobileWindow && mobileWindow.bottomSpacerHeight > 0 ? (
            <div style={{ height: mobileWindow.bottomSpacerHeight }} />
          ) : null}
        </div>
      ) : (
        <div className="rounded-[18px] bg-surface md:hidden">
          {rows.map((row, idx) => renderMobileRow(row, idx))}
        </div>
      )}

      <div className="hidden md:block">
        <div
          className={cn(
            'rounded-[18px] bg-surface',
            shouldVirtualize ? 'overflow-y-auto' : undefined,
          )}
          onScroll={
            shouldVirtualize
              ? (event) => setDesktopScrollTop(event.currentTarget.scrollTop)
              : undefined
          }
          style={shouldVirtualize ? { height: DESKTOP_VIEWPORT_HEIGHT } : undefined}
        >
          <Table>
            <TableHeader
              className={shouldVirtualize ? 'sticky top-0 z-10 bg-surface' : undefined}
            >
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-[0.08em]">
                  {counterpartyColumnLabel}
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.08em]">Amount</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.08em]">Status</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.08em]">Date</TableHead>
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
