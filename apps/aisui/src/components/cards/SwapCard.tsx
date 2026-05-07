"use client";

import { useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { ArrowLeftRight, ChevronDown, RefreshCw, Check } from "lucide-react";
import type { PrepareSwapResult } from "@/lib/tools/prepare-swap";
import { Card, StatRow, TokenLogo } from "./Card";
import { formatPct, formatUsd, cn } from "@/lib/utils";

export function SwapCard({
  data,
  onReceipt,
}: {
  data: PrepareSwapResult;
  onReceipt?: (digest: string) => void;
}) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [status, setStatus] = useState<"idle" | "submitted" | "error">("idle");
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute() {
    setError(null);
    setStatus("submitted");
    try {
      let payload = data.txPayload;
      if (!payload) {
        if (!account?.address) throw new Error("Connect wallet first.");
        const res = await fetch("/api/swap-build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ quote: data.quote, sender: account.address }),
        });
        if (!res.ok) throw new Error(`Build failed (${res.status}).`);
        payload = (await res.json()) as { sender: string; txBytes: string; source: typeof data.source };
      }
      const tx = Transaction.from(Buffer.from(payload.txBytes, "base64"));
      const result = await signAndExecute({ transaction: tx });
      setDigest(result.digest);
      setStatus("idle");
      onReceipt?.(result.digest);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }

  const impact = data.priceImpactPct ?? 0;
  const impactColor =
    impact > 5 ? "var(--down)" : impact > 2 ? "var(--warn)" : "var(--fg)";

  const hops = data.quote.routes ? data.quote.routes.length : 1;
  const slippagePct = data.quote.slippageBps / 100;
  const rate =
    Number(data.amountOutHuman) > 0 && Number(data.amountInHuman) > 0
      ? (Number(data.amountOutHuman) / Number(data.amountInHuman)).toLocaleString(
          "en-US",
          { maximumFractionDigits: 6 },
        )
      : "—";

  // The "best wins by" advantage: max diffPct magnitude across alternatives.
  const advantage = data.alternatives.reduce(
    (acc, alt) => Math.max(acc, Math.abs(alt.diffPct ?? 0)),
    0,
  );

  // The full alternative list shown in the comparison block: the chosen quote
  // is implicitly the "BEST" entry, so we synthesize a row for it at the top.
  const altRows = [
    {
      source: data.source,
      sourceLabel: data.sourceLabel,
      amountOutHuman: data.amountOutHuman,
      hops,
      diffPct: 0,
    },
    ...data.alternatives.map((a) => {
      const altHops =
        a.source === data.source ? hops : 1; // alternatives don't carry hop info; assume 1
      return {
        source: a.source,
        sourceLabel: a.sourceLabel,
        amountOutHuman: a.amountOutHuman,
        hops: altHops,
        diffPct: a.diffPct ?? 0,
      };
    }),
  ];

  return (
    <Card
      title={
        <>
          <ArrowLeftRight size={14} /> Swap quote
        </>
      }
      subtitle={
        <span>
          via <span style={{ color: "var(--accent)" }}>{data.sourceLabel}</span> · {hops} hop
          {hops > 1 ? "s" : ""}
        </span>
      }
      source={
        data.alternatives.length > 0
          ? `Best of ${data.alternatives.length + 1} aggregators`
          : data.sourceLabel
      }
    >
      <div className="sw-pair">
        <SwapLeg
          label="You pay"
          amount={data.amountInHuman}
          symbol={data.tokenIn.symbol}
          usd={data.tokenIn.price ? Number(data.amountInHuman) * data.tokenIn.price : undefined}
        />
        <div className="sw-arrow">
          <div className="sw-arrow-circle">
            <ArrowLeftRight size={12} />
          </div>
        </div>
        <SwapLeg
          label="You receive"
          amount={data.amountOutHuman}
          symbol={data.tokenOut.symbol}
          usd={
            data.tokenOut.price ? Number(data.amountOutHuman) * data.tokenOut.price : undefined
          }
          highlight
        />
      </div>

      <div className="sw-rate">
        <span style={{ color: "var(--fg-muted)" }}>Rate</span>
        <span className="mono tabular">
          1 {data.tokenIn.symbol} = {rate} {data.tokenOut.symbol}
        </span>
        <button type="button" className="sw-rate-refresh" aria-label="Refresh quote">
          <RefreshCw size={11} />
        </button>
      </div>

      <div className="sw-stats">
        <StatRow
          label="Min received"
          value={
            <span className="mono">
              {data.amountOutMinHuman} {data.tokenOut.symbol}
            </span>
          }
        />
        <StatRow label="Slippage" value={<span className="mono">{slippagePct.toFixed(2)}%</span>} />
        <StatRow
          label="Price impact"
          value={
            <span className="mono" style={{ color: impactColor }}>
              {formatPct(impact)}
            </span>
          }
        />
      </div>

      {altRows.length > 1 ? (
        <div className="sw-compare">
          <div className="sw-compare-head">
            <span className="eyebrow">Aggregator comparison</span>
            {advantage > 0 ? (
              <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                Best wins by{" "}
                <span style={{ color: "var(--up)" }} className="mono">
                  +{advantage.toFixed(2)}%
                </span>
              </span>
            ) : null}
          </div>
          {altRows.map((a, i) => {
            const isBest = i === 0;
            return (
              <div key={a.source + i} className={cn("sw-alt", isBest && "best")}>
                <div className="sw-alt-l">
                  {isBest ? <span className="sw-best-tag">BEST</span> : null}
                  <span style={{ fontWeight: isBest ? 600 : 400, fontSize: 12.5 }}>
                    {a.sourceLabel}
                  </span>
                  <span style={{ color: "var(--fg-muted)", fontSize: 11 }}>
                    · {a.hops} hop{a.hops > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="sw-alt-r">
                  <span className="mono tabular" style={{ fontSize: 12.5 }}>
                    {a.amountOutHuman} {data.tokenOut.symbol}
                  </span>
                  {!isBest ? (
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--down)" }}>
                      {formatPct(a.diffPct)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {data.warnings.length > 0 ? (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {data.warnings.map((w, idx) => (
            <div
              key={idx}
              style={{
                fontSize: 11.5,
                padding: "6px 10px",
                background: "color-mix(in oklch, var(--warn) 12%, transparent)",
                color: "var(--warn)",
                borderRadius: 6,
              }}
            >
              {w}
            </div>
          ))}
        </div>
      ) : null}

      <div className="sw-foot">
        <button type="button" className="sw-cancel">Cancel</button>
        {!account ? (
          <div className="sw-execute" style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}>
            Connect a wallet to execute
          </div>
        ) : digest ? (
          <a
            href={`https://suivision.xyz/txblock/${digest}`}
            target="_blank"
            rel="noreferrer"
            className="sw-execute success"
          >
            <Check size={14} /> Submitted · view on SuiVision
          </a>
        ) : (
          <button
            type="button"
            disabled={isPending || status === "submitted"}
            onClick={execute}
            className="sw-execute"
          >
            {isPending || status === "submitted" ? (
              <>
                <span
                  className="pulse"
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                  }}
                />
                Awaiting wallet signature…
              </>
            ) : (
              "Sign & swap"
            )}
          </button>
        )}
      </div>

      {error ? (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: "color-mix(in oklch, var(--down) 14%, transparent)",
            color: "var(--down)",
            fontSize: 11.5,
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      ) : null}

      <style>{`
        .sw-pair {
          display: grid;
          grid-template-columns: 1fr 36px 1fr;
          gap: 8px;
          align-items: center;
          margin-bottom: 6px;
        }
        @media (max-width: 540px) {
          .sw-pair { grid-template-columns: 1fr; }
          .sw-arrow { transform: rotate(90deg); margin: 0 auto; }
        }
        .sw-arrow {
          display: grid;
          place-items: center;
        }
        .sw-arrow-circle {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: var(--bg);
          border: 1px solid var(--border);
          display: grid;
          place-items: center;
          color: var(--accent);
        }

        .sw-rate {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 7px;
          font-size: 12px;
          margin-bottom: 8px;
        }
        .sw-rate-refresh {
          margin-left: auto;
          background: transparent;
          border: 0;
          color: var(--fg-muted);
          width: 22px;
          height: 22px;
          border-radius: 5px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .sw-rate-refresh:hover { background: var(--card); color: var(--accent); }

        .sw-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          column-gap: 18px;
          padding: 10px 0;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        @media (max-width: 540px) {
          .sw-stats { grid-template-columns: 1fr 1fr; }
        }

        .sw-compare { margin-top: 12px; }
        .sw-compare-head {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          align-items: baseline;
        }
        .sw-alt {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 12px;
          margin-bottom: 3px;
          border-radius: 6px;
          background: transparent;
          border: 1px solid transparent;
        }
        .sw-alt.best {
          background: color-mix(in oklch, var(--accent) 6%, transparent);
          border-color: var(--accent-soft);
        }
        .sw-alt-l {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .sw-alt-r {
          display: flex;
          gap: 8px;
          align-items: baseline;
        }
        .sw-best-tag {
          font-family: var(--font-mono);
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          padding: 2px 6px;
          background: var(--accent);
          color: var(--on-accent);
          border-radius: 3px;
        }

        .sw-foot {
          display: flex;
          gap: 8px;
          margin-top: 14px;
        }
        .sw-cancel {
          flex: 0 0 auto;
          padding: 10px 16px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--fg-mid);
          font-size: 13px;
          cursor: pointer;
        }
        .sw-execute {
          flex: 1;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--accent);
          color: var(--on-accent);
          border: 0;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
        }
        .sw-execute:disabled { opacity: 0.65; cursor: progress; }
        .sw-execute.success {
          background: color-mix(in oklch, var(--up) 18%, transparent);
          color: var(--up);
        }
      `}</style>
    </Card>
  );
}

function SwapLeg({
  label,
  amount,
  symbol,
  usd,
  highlight,
}: {
  label: string;
  amount: string;
  symbol: string;
  usd?: number;
  highlight?: boolean;
}) {
  return (
    <div className={cn("sw-leg", highlight && "hl")}>
      <div className="eyebrow">{label}</div>
      <div className="sw-leg-main">
        <span className="mono tabular sw-leg-amt">{amount}</span>
        <span className="symbol-chip">
          <TokenLogo symbol={symbol} size={20} />
          {symbol}
          <ChevronDown size={10} />
        </span>
      </div>
      {usd !== undefined ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
          ≈ {formatUsd(usd)}
        </div>
      ) : null}
      <style>{`
        .sw-leg {
          padding: 12px 14px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 10px;
          min-width: 0;
        }
        .sw-leg.hl {
          background: color-mix(in oklch, var(--accent) 7%, transparent);
          border-color: var(--accent-soft);
        }
        .sw-leg-main {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-top: 4px;
          margin-bottom: 2px;
          min-width: 0;
        }
        .sw-leg-amt {
          font-size: 22px;
          font-weight: 600;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .symbol-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 8px 4px 4px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 500;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
