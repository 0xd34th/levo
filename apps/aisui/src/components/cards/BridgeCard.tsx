"use client";

import { ArrowLeftRight, Wallet } from "lucide-react";
import type { PrepareBridgeResult } from "@/lib/tools/prepare-bridge";
import { Card } from "./Card";
import { shortAddr } from "@/lib/utils";

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `~${m} min` : `~${(m / 60).toFixed(1)} h`;
}

function chainLabel(chain: PrepareBridgeResult["fromChain"]): string {
  if (chain.name) return chain.name;
  return `chain ${chain.chainIndex}`;
}

function chainColor(chain: PrepareBridgeResult["fromChain"]): string {
  // Stable hue from the chain index so each chain reads as its own color.
  const idx = Number.parseInt(chain.chainIndex, 10);
  const h = ((Number.isFinite(idx) ? idx : 0) * 47) % 360;
  return `oklch(70% 0.13 ${h})`;
}

export function BridgeCard({ data }: { data: PrepareBridgeResult }) {
  const fromLabel = chainLabel(data.fromChain);
  const toLabel = chainLabel(data.toChain);
  const fromColor = chainColor(data.fromChain);
  const toColor = chainColor(data.toChain);
  const eta = formatDuration(data.estimatedTimeSec);

  // Three-step progress shown in the design: sign on source → bridge confirms → lands on dest.
  const steps: Array<{ label: string; state: "current" | "pending" | "done" }> = [
    {
      label: `Sign on ${fromLabel} (OKX Wallet)`,
      state: "current",
    },
    {
      label: "Bridge confirms (cross-chain finality)",
      state: "pending",
    },
    {
      label: `Lands on ${toLabel}`,
      state: "pending",
    },
  ];

  return (
    <Card
      title={
        <>
          <ArrowLeftRight size={14} /> Cross-chain transfer
        </>
      }
      subtitle={
        <span>
          via {data.bestRoute?.bridgeName ?? "OKX cross-chain"} · ETA{" "}
          <span className="mono">{eta}</span>
        </span>
      }
      source="OKX X-Routing"
    >
      <div className="bc-flow">
        <BridgeLeg
          label="From"
          chain={fromLabel}
          chainColor={fromColor}
          amount={data.amountIn}
          tokenAddress={data.fromTokenAddress}
        />
        <div className="bc-arrow">
          <div className="bc-line" />
          <div className="bc-eta mono">{eta}</div>
          <div className="bc-line" />
        </div>
        <BridgeLeg
          label="To"
          chain={toLabel}
          chainColor={toColor}
          amount={data.amountOut ?? "—"}
          tokenAddress={data.toTokenAddress}
        />
      </div>

      {data.bestRoute ? (
        <div className="bc-fee">
          <span className="eyebrow">Fee</span>
          <span className="mono" style={{ fontSize: 12 }}>
            {[
              data.bestRoute.fromChainNetworkFee,
              data.bestRoute.toChainNetworkFee,
              data.bestRoute.crossChainFee,
            ]
              .filter(Boolean)
              .join(" + ") || "—"}
          </span>
        </div>
      ) : null}

      <div className="bc-steps">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Progress</div>
        {steps.map((s, i) => (
          <div key={i} className={"bc-step " + s.state}>
            <span className="bc-step-marker">{s.state === "done" ? "✓" : i + 1}</span>
            <span style={{ fontSize: 12.5 }}>{s.label}</span>
            {s.state === "current" ? (
              <span
                className="mono"
                style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 11 }}
              >
                ● in progress
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {data.alternates.length > 0 ? (
        <details
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--fg-muted)",
          }}
        >
          <summary style={{ cursor: "pointer" }}>
            {data.alternates.length} alternate route{data.alternates.length > 1 ? "s" : ""}
          </summary>
          <ul style={{ marginTop: 6, paddingLeft: 16 }}>
            {data.alternates.map((alt, idx) => (
              <li key={idx}>{alt.bridgeName}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {data.warnings.length > 0 ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
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

      {data.unavailableReason ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            padding: "6px 10px",
            background: "color-mix(in oklch, var(--down) 12%, transparent)",
            color: "var(--down)",
            borderRadius: 6,
          }}
        >
          {data.unavailableReason}
        </div>
      ) : null}

      <a
        href={data.okxWalletDeepLink}
        target="_blank"
        rel="noreferrer"
        className="bc-cta"
      >
        <Wallet size={13} /> Open OKX Wallet to sign
      </a>

      <p
        style={{
          marginTop: 8,
          fontSize: 10.5,
          color: "var(--fg-faint)",
          textAlign: "center",
        }}
      >
        aisui v1 only signs on Sui — finish the source-chain leg in OKX Wallet, then come back to track inbound activity.
      </p>

      <style>{`
        .bc-flow {
          display: grid;
          grid-template-columns: 1fr 70px 1fr;
          gap: 4px;
          align-items: stretch;
          margin-bottom: 12px;
        }
        @media (max-width: 540px) {
          .bc-flow { grid-template-columns: 1fr; gap: 8px; }
        }
        .bc-arrow {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 0 4px;
        }
        @media (max-width: 540px) {
          .bc-arrow { flex-direction: row; }
        }
        .bc-line {
          width: 100%;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent-soft), transparent);
          flex: 1;
          min-height: 12px;
        }
        .bc-eta {
          font-size: 10px;
          color: var(--accent);
          padding: 2px 7px;
          background: var(--bg);
          border: 1px solid var(--accent-soft);
          border-radius: 999px;
          white-space: nowrap;
        }
        .bc-fee {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 7px;
          margin-bottom: 12px;
        }
        .bc-steps {
          padding: 12px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 9px;
          margin-bottom: 12px;
        }
        .bc-step {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 0;
          color: var(--fg-mid);
        }
        .bc-step.done { color: var(--fg); }
        .bc-step.pending { color: var(--fg-faint); }
        .bc-step-marker {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--card);
          border: 1px solid var(--border);
          display: grid;
          place-items: center;
          font-size: 10px;
          font-family: var(--font-mono);
          color: var(--fg-faint);
          flex-shrink: 0;
        }
        .bc-step.current .bc-step-marker {
          background: color-mix(in oklch, var(--accent) 18%, transparent);
          border-color: var(--accent);
          color: var(--accent);
        }
        .bc-step.done .bc-step-marker {
          background: color-mix(in oklch, var(--up) 22%, transparent);
          border-color: var(--up);
          color: var(--up);
        }
        .bc-cta {
          width: 100%;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          padding: 11px;
          background: var(--accent);
          color: var(--on-accent);
          border: 0;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
        }
        .bc-cta:hover { background: var(--accent-2); }
      `}</style>
    </Card>
  );
}

function BridgeLeg({
  label,
  chain,
  chainColor,
  amount,
  tokenAddress,
}: {
  label: string;
  chain: string;
  chainColor: string;
  amount: string;
  tokenAddress: string;
}) {
  return (
    <div className="bc-leg">
      <div
        className="eyebrow"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
      >
        <span>{label}</span>
        <span className="bc-chain-tag" style={{ color: chainColor }}>
          ● {chain}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, minWidth: 0 }}>
        <span
          className="mono tabular"
          style={{
            fontSize: 22,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {amount}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2, wordBreak: "break-all" }}>
        {shortAddr(tokenAddress, 10, 8)}
      </div>
      <style>{`
        .bc-leg {
          padding: 12px 14px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 10px;
          min-width: 0;
        }
        .bc-chain-tag {
          font-size: 10px;
          font-family: var(--font-sans);
          letter-spacing: 0;
          text-transform: none;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
