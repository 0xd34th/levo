"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { ExternalLink } from "lucide-react";
import type { TokenMetricsResult } from "@/lib/tools/get-token-metrics";
import { Card, StatRow, TokenLogo, VerifiedTick } from "./Card";
import { formatPct, formatUsd, formatNumber, cn } from "@/lib/utils";

const WINDOWS = ["1H", "24H", "7D", "30D", "ALL"] as const;

export function TokenCard({ data }: { data: TokenMetricsResult }) {
  const positive = (data.priceChange24H ?? 0) >= 0;
  const series = data.ohlcv.map((p) => ({ t: p.t * 1000, c: p.c }));
  const stroke = positive ? "var(--up)" : "var(--down)";

  return (
    <Card
      title={
        <>
          <TokenLogo symbol={data.symbol} src={data.logo} />
          <span>{data.name}</span>
          <span style={{ color: "var(--fg-muted)", fontWeight: 500, fontSize: 13 }}>
            {data.symbol}
          </span>
          {data.verified ? <VerifiedTick /> : null}
          {data.scamFlag ? (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                background: "color-mix(in oklch, var(--down) 18%, transparent)",
                color: "var(--down)",
                borderRadius: 4,
              }}
            >
              ⚠ scam-flagged
            </span>
          ) : null}
        </>
      }
      subtitle={<span className="mono">{data.coinType}</span>}
      source="BlockVision · live"
      rightSlot={
        <div style={{ textAlign: "right" }}>
          <div
            className="mono tabular"
            style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}
          >
            {formatUsd(data.price)}
          </div>
          {data.priceChange24H !== undefined ? (
            <div
              style={{
                fontSize: 11.5,
                color: positive ? "var(--up)" : "var(--down)",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 4,
                marginTop: 2,
              }}
            >
              <span className="mono tabular">{formatPct(data.priceChange24H)}</span>
              <span style={{ color: "var(--fg-muted)" }}>· 24H</span>
            </div>
          ) : null}
        </div>
      }
    >
      <div className="tk-window">
        {WINDOWS.map((w) => (
          <button key={w} type="button" className={cn("tk-w", w === data.window && "active")}>
            {w}
          </button>
        ))}
      </div>

      {series.length > 1 ? (
        <div style={{ height: 120, margin: "8px -4px 4px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
              <defs>
                <linearGradient id="tk-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis dataKey="c" hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--fg)",
                }}
                labelFormatter={(v) => new Date(v as number).toLocaleString()}
                formatter={(v) => formatUsd(Number(v))}
              />
              <Area
                dataKey="c"
                stroke={stroke}
                strokeWidth={1.6}
                fill="url(#tk-gradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="tk-stats">
        <StatRow label="Market cap" value={formatUsd(data.marketCap ?? 0, { compact: true })} />
        <StatRow label="FDV" value={formatUsd(data.fdv ?? 0, { compact: true })} />
        <StatRow label="24H volume" value={formatUsd(data.volume24H ?? 0, { compact: true })} />
        <StatRow label="Liquidity" value={formatUsd(data.liquidity ?? 0, { compact: true })} />
        <StatRow label="Holders" value={formatNumber(data.holders ?? 0)} />
        <StatRow label="Window" value={data.window} />
      </div>

      <div className="tk-actions">
        <a
          className="ai-btn link"
          href={`https://suivision.xyz/coin/${encodeURIComponent(data.coinType)}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={11} /> SuiVision
        </a>
      </div>

      <style>{`
        .tk-window {
          display: flex;
          gap: 2px;
          padding: 2px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 7px;
          width: fit-content;
          margin-bottom: 4px;
        }
        .tk-w {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 500;
          color: var(--fg-muted);
          background: transparent;
          border: 0;
          border-radius: 5px;
          font-family: var(--font-mono);
          cursor: pointer;
        }
        .tk-w:hover { color: var(--fg); }
        .tk-w.active { background: var(--card-hi); color: var(--fg); }

        .tk-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          column-gap: 18px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }
        @media (max-width: 540px) {
          .tk-stats { grid-template-columns: 1fr 1fr; }
        }

        .tk-actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
        .ai-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 7px;
          border: 1px solid var(--border);
          background: var(--bg-soft);
          color: var(--fg);
          cursor: pointer;
          text-decoration: none;
        }
        .ai-btn.link {
          background: transparent;
          border-color: transparent;
          color: var(--fg-muted);
          margin-left: auto;
        }
        .ai-btn.link:hover { color: var(--fg); }
      `}</style>
    </Card>
  );
}
