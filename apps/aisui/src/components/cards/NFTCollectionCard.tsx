"use client";

import type { NftCollectionResult } from "@/lib/tools/get-nft-collection";
import { Card, StatRow } from "./Card";
import { formatNumber, formatUsd } from "@/lib/utils";
import Image from "next/image";

export function NFTCollectionCard({ data }: { data: NftCollectionResult }) {
  const c = data.collection;
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          {c.image ? (
            <Image src={c.image} alt={c.name} width={36} height={36} className="rounded" unoptimized />
          ) : null}
          <span>{c.name}</span>
          {c.verified ? <span className="text-[var(--color-accent)]">✓</span> : null}
        </div>
      }
      subtitle={c.type}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <StatRow label="Floor" value={c.floorPriceUsd ? formatUsd(c.floorPriceUsd) : `${c.floorPrice ?? "—"} SUI`} />
        <StatRow label="Total supply" value={formatNumber(c.totalSupply ?? 0)} />
        <StatRow label="Holders" value={formatNumber(c.holders ?? 0)} />
        <StatRow label="24H volume" value={formatUsd(c.volume24H ?? 0, { compact: true })} />
        <StatRow label="7D volume" value={formatUsd(c.volume7D ?? 0, { compact: true })} />
        <StatRow label="Sales 24H" value={formatNumber(c.sales24H ?? 0)} />
      </div>
      {data.recentSales.length > 0 ? (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">Recent sales</div>
          <div className="grid grid-cols-4 gap-2">
            {data.recentSales.slice(0, 8).map((s) => (
              <div key={s.objectId} className="overflow-hidden rounded-md border border-[var(--color-border)]">
                {s.image ? (
                  <Image src={s.image} alt={s.name ?? ""} width={120} height={120} className="aspect-square w-full object-cover" unoptimized />
                ) : (
                  <div className="aspect-square bg-[var(--color-bg-soft)]" />
                )}
                <div className="px-1.5 py-1 text-xs">
                  <div className="truncate">{s.name ?? "—"}</div>
                  <div className="text-[var(--color-fg-muted)]">{s.price ? `${s.price} SUI` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
