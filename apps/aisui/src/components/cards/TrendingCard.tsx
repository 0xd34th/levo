"use client";

import type { TrendingResult } from "@/lib/tools/get-trending";
import { Card } from "./Card";
import { formatPct, formatUsd, cn } from "@/lib/utils";
import Image from "next/image";

export function TrendingCard({ data }: { data: TrendingResult }) {
  return (
    <Card title={`Trending · ${data.window}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">Coins</div>
          <div className="space-y-1">
            {data.coins.map((c) => {
              const positive = (c.priceChangePercentage24H ?? 0) >= 0;
              return (
                <div key={c.coinType} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--color-bg-soft)]">
                  {c.logo ? (
                    <Image src={c.logo} alt={c.symbol} width={20} height={20} className="rounded-full" unoptimized />
                  ) : (
                    <div className="size-5 rounded-full bg-[var(--color-bg-soft)]" />
                  )}
                  <div className="flex-1 min-w-0 truncate text-sm">{c.symbol}</div>
                  <div className="text-right text-sm tabular-nums">{formatUsd(c.price)}</div>
                  <div className={cn("w-16 text-right text-xs", positive ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
                    {formatPct(c.priceChangePercentage24H ?? 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">DEX pools</div>
          <div className="space-y-1">
            {data.pools.map((p) => (
              <div key={p.poolId} className="rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-bg-soft)]">
                <div className="flex items-center justify-between">
                  <span>{p.pair}</span>
                  <span className="text-xs text-[var(--color-fg-muted)]">{p.protocol}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-[var(--color-fg-muted)] tabular-nums">
                  <span>TVL {formatUsd(p.tvlUsd ?? 0, { compact: true })}</span>
                  <span>Vol24H {formatUsd(p.volume24HUsd ?? 0, { compact: true })}</span>
                  {p.apr !== undefined ? <span className="text-[var(--color-up)]">{formatPct(p.apr)} APR</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
