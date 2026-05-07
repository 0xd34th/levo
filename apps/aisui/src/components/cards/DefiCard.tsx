"use client";

import type { DefiPositionsResult } from "@/lib/tools/get-defi-positions";
import { Card } from "./Card";
import { formatPct, formatUsd, shortAddr } from "@/lib/utils";

export function DefiCard({ data }: { data: DefiPositionsResult }) {
  return (
    <Card
      title="DeFi positions"
      subtitle={shortAddr(data.address)}
      rightSlot={
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{formatUsd(data.totalValueUsd)}</div>
          <div className="text-xs text-[var(--color-fg-muted)]">{data.protocols} protocol(s)</div>
        </div>
      }
    >
      <div className="space-y-3">
        {data.positions.map((p) => (
          <div key={p.protocol} className="rounded-md border border-[var(--color-border)] p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium capitalize">{p.protocol}</div>
              {p.category ? (
                <span className="rounded-full bg-[var(--color-bg-soft)] px-2 py-0.5 text-xs text-[var(--color-fg-muted)]">
                  {p.category}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 space-y-1">
              {p.positions.map((pos, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="text-[var(--color-fg-muted)]">{pos.name ?? "Position"}</div>
                  <div className="text-right tabular-nums">
                    {formatUsd(pos.valueUsd ?? 0)}
                    {pos.apr !== undefined ? (
                      <span className="ml-2 text-xs text-[var(--color-up)]">{formatPct(pos.apr)} APR</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {data.positions.length === 0 ? (
          <div className="rounded-md bg-[var(--color-bg-soft)] p-4 text-center text-sm text-[var(--color-fg-muted)]">
            No DeFi positions found.
          </div>
        ) : null}
      </div>
    </Card>
  );
}
