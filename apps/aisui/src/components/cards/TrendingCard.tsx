"use client";

import type { TrendingResult } from "@/lib/tools/get-trending";
import { Card } from "./Card";
import { formatPct, formatUsd, cn } from "@/lib/utils";
import Image from "next/image";

export function TrendingCard({ data }: { data: TrendingResult }) {
  return (
    <Card title={`Trending · ${data.window}`} source={data.source}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">Coins</div>
          {data.coins.length ? (
            <div className="space-y-1">
              {data.coins.map((c) => {
                const positive = (c.priceChangePercentage24H ?? 0) >= 0;
                return (
                  <div key={c.coinType} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--color-bg-soft)]">
                    {c.logo ? (
                      <Image src={c.logo} alt={c.symbol} width={20} height={20} className="rounded-full" unoptimized />
                    ) : (
                      <div className="grid size-5 place-items-center rounded-full bg-[var(--color-bg-soft)] text-[10px] font-semibold text-[var(--color-fg-muted)]">
                        {c.symbol.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.symbol}</div>
                      {c.name ? (
                        <div className="truncate text-[11px] text-[var(--color-fg-muted)]">{c.name}</div>
                      ) : null}
                    </div>
                    <div className="text-right text-sm tabular-nums">{formatUsd(c.price)}</div>
                    <div className={cn("w-16 text-right text-xs", positive ? "text-[var(--color-up)]" : "text-[var(--color-down)]")}>
                      {formatPct(c.priceChangePercentage24H ?? 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyLine text="No trending coin data returned." />
          )}
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">DEX pools</div>
          {data.pools.length ? (
            <div className="space-y-1">
              {data.pools.map((p) => (
                <div key={p.poolId || p.pair} className="rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-bg-soft)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{p.pair}</span>
                    <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">{p.protocol}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-fg-muted)] tabular-nums">
                    <span>TVL {formatUsd(p.tvlUsd ?? 0, { compact: true })}</span>
                    <span>Vol24H {formatUsd(p.volume24HUsd ?? 0, { compact: true })}</span>
                    {p.apr !== undefined ? <span className="text-[var(--color-up)]">{formatPct(p.apr)} APR</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyLine text="No DEX pools returned." />
          )}
        </div>
      </div>
      {data.warning ? (
        <div className="mt-3 rounded-md bg-[var(--color-down)]/10 p-2 text-xs text-[var(--color-down)]">
          {data.warning}
        </div>
      ) : null}
    </Card>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-bg-soft)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
      {text}
    </div>
  );
}
