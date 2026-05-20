"use client";

import { Wallet, AlertTriangle, Layers } from "lucide-react";
import Image from "next/image";
import type { PortfolioResult } from "@/lib/tools/get-portfolio";
import { Card, TokenLogo, VerifiedTick } from "./Card";
import { formatUsd, formatNumber, shortAddr, cn } from "@/lib/utils";

// Hash a coin type into a stable hue for the allocation bar / token glyphs.
function hueFromCoinType(coinType: string): number {
  let h = 0;
  for (let i = 0; i < coinType.length; i++) {
    h = (h * 31 + coinType.charCodeAt(i)) % 360;
  }
  return h;
}

function colorFor(coinType: string): string {
  return `oklch(72% 0.13 ${hueFromCoinType(coinType)})`;
}

export function PortfolioCard({ data }: { data: PortfolioResult }) {
  const coinCount = data.coinCount ?? data.topCoins.length;
  const nftCount = data.nftCount ?? data.topNfts.length;
  const unverifiedUsd = data.unverifiedUsd ?? 0;
  const suspectUsd = data.suspectUsd ?? 0;
  const suspectCount = data.suspectCount ?? 0;
  const lpUsd = data.lpUsd ?? 0;
  const lpCount = data.lpCount ?? 0;

  // Allocation bar reflects the verified-bucket breakdown only — including
  // suspect tokens here would distort proportions when their claimed USD is
  // fake. Tail/Other still falls within verified.
  const verifiedCoins = data.topCoins.filter((c) => c.trust === "verified");
  const verifiedTotal = verifiedCoins.reduce((acc, c) => acc + c.usdValue, 0) || 1;
  const sortedVerified = [...verifiedCoins].sort((a, b) => b.usdValue - a.usdValue);
  const head = sortedVerified.slice(0, 6);
  const tail = sortedVerified.slice(6);
  const otherUsd = tail.reduce((acc, c) => acc + c.usdValue, 0);
  const allocation = [
    ...head.map((c) => ({
      symbol: c.symbol,
      pct: (c.usdValue / verifiedTotal) * 100,
      color: colorFor(c.coinType),
    })),
    ...(otherUsd > 0
      ? [{ symbol: "Other", pct: (otherUsd / verifiedTotal) * 100, color: "var(--fg-faint)" }]
      : []),
  ];

  return (
    <Card
      title={
        <>
          <Wallet size={14} />
          <span>Portfolio</span>
        </>
      }
      subtitle={
        <span>
          {data.resolvedFrom ? (
            <>
              <span style={{ color: "var(--accent)" }}>{data.resolvedFrom}</span> ·{" "}
            </>
          ) : null}
          <span className="mono">{shortAddr(data.address, 8, 6)}</span>
        </span>
      }
      source="BlockVision"
      rightSlot={
        <div style={{ textAlign: "right" }}>
          <div
            className="mono tabular"
            style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}
          >
            {formatUsd(data.totalUsd, { compact: data.totalUsd > 100_000 })}
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>
            {coinCount} coins · {nftCount} NFTs
          </div>
          {lpUsd > 0 ? (
            <div
              className="pf-extra pf-lp mono tabular"
              title="DEX LP receipt tokens (tracked separately via get_defi_positions). Excluded from spot total to avoid double-counting."
            >
              <Layers size={10} aria-hidden />
              {formatUsd(lpUsd, { compact: lpUsd > 100_000 })} in LP
              {lpCount > 0 ? <span style={{ opacity: 0.7 }}> · {lpCount}</span> : null}
            </div>
          ) : null}
          {unverifiedUsd > 0 ? (
            <div className="pf-extra mono tabular" title="Unverified low-value tokens excluded from total">
              + {formatUsd(unverifiedUsd, { compact: unverifiedUsd > 100_000 })} unverified
            </div>
          ) : null}
          {suspectUsd > 0 ? (
            <div
              className="pf-extra pf-suspect mono tabular"
              title="Suspicious tokens (impersonation / unverified high-value / manipulated price). Excluded from total."
            >
              <AlertTriangle size={10} aria-hidden />
              {formatUsd(suspectUsd, { compact: suspectUsd > 100_000 })} suspicious
              {suspectCount > 0 ? <span style={{ opacity: 0.7 }}> · {suspectCount}</span> : null}
            </div>
          ) : null}
        </div>
      }
    >
      {allocation.length > 0 ? (
        <div className="pf-allocation">
          {allocation.map((a, i) => (
            <span
              key={i}
              className="pf-seg"
              style={{ width: `${a.pct}%`, background: a.color }}
              title={`${a.symbol} ${a.pct.toFixed(1)}%`}
            />
          ))}
        </div>
      ) : null}

      <div className="pf-coins">
        {data.topCoins.map((c) => {
          const positive = (c.priceChange24H ?? 0) >= 0;
          const balance = Number(c.balance) / 10 ** c.decimals;
          const isSuspicious = c.trust === "suspicious";
          const isUnverified = c.trust === "unverified";
          const isLp = c.trust === "lp";
          return (
            <div
              key={c.coinType}
              className={cn(
                "pf-row",
                isSuspicious && "pf-row-suspect",
                isUnverified && "pf-row-unverified",
                isLp && "pf-row-lp",
              )}
              title={c.trustReason}
            >
              <TokenLogo symbol={c.symbol} src={c.logo} color={colorFor(c.coinType)} />
              <div className="pf-row-l">
                <div className="pf-sym">
                  {c.symbol}
                  {c.trust === "verified" ? <VerifiedTick /> : null}
                  {isLp ? (
                    <Layers
                      size={11}
                      aria-label="LP token"
                      style={{ color: "var(--fg-muted)" }}
                    />
                  ) : null}
                  {isSuspicious ? (
                    <AlertTriangle
                      size={11}
                      aria-label="suspicious"
                      style={{ color: "var(--down)" }}
                    />
                  ) : null}
                </div>
                <div className="pf-bal mono">
                  {formatNumber(balance)} {c.symbol}
                  {isLp ? (
                    <span className="pf-lp-reason"> · LP receipt (DeFi)</span>
                  ) : null}
                  {isSuspicious && c.trustReason ? (
                    <span className="pf-suspect-reason"> · {c.trustReason}</span>
                  ) : null}
                </div>
              </div>
              <div className="pf-row-r">
                <div className="mono tabular pf-usd">
                  {formatUsd(c.usdValue, { compact: c.usdValue > 100_000 })}
                </div>
                {c.priceChange24H !== undefined ? (
                  <div className={cn("pf-change mono", positive ? "u" : "d")}>
                    {positive ? "+" : ""}
                    {c.priceChange24H.toFixed(2)}%
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {data.topNfts.length > 0 ? (
        <div className="pf-nfts">
          <div
            className="eyebrow"
            style={{
              marginBottom: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span>NFTs · {nftCount}</span>
          </div>
          <div className="pf-nft-grid">
            {data.topNfts.slice(0, 4).map((n) => (
              <div key={n.objectId} className="pf-nft">
                <div
                  className="pf-nft-img"
                  style={{
                    background: n.image
                      ? "transparent"
                      : `oklch(72% 0.10 ${hueFromCoinType(n.objectId)})`,
                  }}
                >
                  {n.image ? (
                    <Image
                      src={n.image}
                      alt={n.name ?? "NFT"}
                      fill
                      className="pf-nft-img-fill"
                      unoptimized
                      sizes="(max-width: 640px) 50vw, 25vw"
                    />
                  ) : (
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: "var(--on-accent)" }}
                    >
                      {(n.name ?? "?")[0]}
                    </span>
                  )}
                </div>
                <div className="pf-nft-name">{n.name ?? shortAddr(n.objectId)}</div>
                {n.estimatedValueUsd ? (
                  <div className="pf-nft-floor mono">{formatUsd(n.estimatedValueUsd)}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <style>{`
        .pf-allocation {
          display: flex;
          height: 4px;
          border-radius: 2px;
          overflow: hidden;
          background: var(--bg-soft);
          margin-bottom: 14px;
        }
        .pf-seg { display: block; }

        .pf-coins { display: flex; flex-direction: column; }
        .pf-row {
          display: grid;
          grid-template-columns: 22px 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 8px 0;
          border-top: 1px solid var(--border);
        }
        .pf-row:first-child { border-top: 0; }
        .pf-row-unverified { opacity: 0.65; }
        .pf-row-suspect .pf-usd,
        .pf-row-suspect .pf-sym { color: var(--down); }
        .pf-row-suspect { background: color-mix(in oklch, var(--down) 6%, transparent); }
        .pf-suspect-reason { color: var(--down); }
        .pf-row-lp .pf-usd,
        .pf-row-lp .pf-sym { color: var(--fg-mid); }
        .pf-lp-reason { color: var(--fg-muted); font-style: italic; }
        .pf-row-l { min-width: 0; }
        .pf-sym {
          font-size: 13.5px;
          font-weight: 500;
          display: flex;
          gap: 5px;
          align-items: center;
        }
        .pf-bal {
          font-size: 11px;
          color: var(--fg-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pf-row-r { text-align: right; }
        .pf-usd { font-size: 13.5px; font-weight: 500; }
        .pf-change { font-size: 11px; }
        .pf-change.u { color: var(--up); }
        .pf-change.d { color: var(--down); }
        .pf-extra {
          font-size: 11px;
          color: var(--fg-muted);
          margin-top: 2px;
        }
        .pf-extra.pf-suspect {
          color: var(--down);
          display: inline-flex;
          align-items: center;
          gap: 4px;
          justify-content: flex-end;
        }
        .pf-extra.pf-lp {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          justify-content: flex-end;
          color: var(--fg-mid);
        }

        .pf-nfts {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid var(--border);
        }
        .pf-nft-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        @media (max-width: 540px) {
          .pf-nft-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .pf-nft {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .pf-nft-img {
          position: relative;
          aspect-ratio: 1;
          border-radius: 8px;
          display: grid;
          place-items: center;
          margin-bottom: 4px;
          overflow: hidden;
        }
        .pf-nft-img-fill { object-fit: cover; }
        .pf-nft-name {
          font-size: 11.5px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pf-nft-floor { font-size: 10.5px; color: var(--fg-muted); }
      `}</style>
    </Card>
  );
}
