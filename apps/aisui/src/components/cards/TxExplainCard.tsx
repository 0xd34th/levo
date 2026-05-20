"use client";

import { ExternalLink, Wallet, Box } from "lucide-react";
import type { ExplainedTx } from "@/lib/sui/ptb-explainer";
import { Card } from "./Card";
import { shortAddr } from "@/lib/utils";

const STEP_COLOR: Record<string, string> = {
  SplitCoins: "var(--accent)",
  MoveCall: "var(--up)",
  TransferObjects: "oklch(82% 0.16 75)",
  MergeCoins: "var(--accent)",
  MakeMoveVec: "var(--fg-muted)",
  Publish: "oklch(74% 0.16 295)",
  Upgrade: "oklch(74% 0.16 295)",
  Other: "var(--fg-muted)",
};

export function TxExplainCard({ data }: { data: ExplainedTx }) {
  const cfg =
    data.status === "success"
      ? { label: "Success", c: "var(--up)" }
      : data.status === "failure"
      ? { label: "Failed", c: "var(--down)" }
      : { label: data.status, c: "var(--fg-muted)" };

  // Aggregate balance changes by address (so a sender's net coin position is one row).
  const aggregated = aggregateBalanceChanges(data.balanceChanges);

  return (
    <Card
      title={
        <>
          <span>Transaction</span>
          <span className="status-pill">
            <span className="sp-dot" style={{ background: cfg.c }} />
            <span
              style={{
                color: cfg.c,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.04,
                textTransform: "uppercase",
              }}
            >
              {cfg.label}
            </span>
          </span>
        </>
      }
      subtitle={
        <span>
          <span className="mono">{shortAddr(data.digest, 10, 8)}</span>
          {data.timestamp ? ` · ${new Date(data.timestamp).toLocaleString()}` : ""}
          {data.gasFeeSui !== undefined ? (
            <>
              {" · gas "}
              <span className="mono">{data.gasFeeSui.toFixed(5)}</span> SUI
            </>
          ) : null}
        </span>
      }
      source="Sui RPC + PTB decompiler"
      rightSlot={
        <a
          href={`https://suivision.xyz/txblock/${data.digest}`}
          target="_blank"
          rel="noreferrer"
          className="ai-btn ghost"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            fontSize: 11.5,
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            color: "var(--fg)",
            textDecoration: "none",
          }}
        >
          <ExternalLink size={11} /> SuiVision
        </a>
      }
    >
      <div className="tx-summary">{data.summary}</div>

      {data.errorMessage ? (
        <div className="rounded-md mt-2 bg-[var(--color-down)]/15 p-2 text-xs text-[var(--color-down)]">
          {data.errorMessage}
        </div>
      ) : null}

      {data.sender ? (
        <div className="tx-flow">
          <Party label="Sender" addr={data.sender} icon={<Wallet size={14} />} />
          <FlowArrow steps={data.steps.length} />
          <Party label="Recipient" addr={data.sender} icon={<Wallet size={14} />} />
        </div>
      ) : null}

      <div className="tx-steps">
        <div className="eyebrow">PTB · {data.steps.length} commands</div>
        {data.steps.map((s) => {
          const tColor = STEP_COLOR[s.kind] ?? "var(--fg-muted)";
          return (
            <div key={s.index} className="ptb-step">
              <div className="ptb-idx mono">{String(s.index + 1).padStart(2, "0")}</div>
              <div className="ptb-tag mono" style={{ color: tColor, borderColor: tColor }}>
                {s.kind}
              </div>
              <div className="ptb-desc">{s.description}</div>
              {s.module ? <div className="mono ptb-mod">{s.module}</div> : null}
            </div>
          );
        })}
      </div>

      {aggregated.length > 0 ? (
        <div className="tx-bc">
          <div className="eyebrow">Net balance changes</div>
          {aggregated.slice(0, 8).map((b, i) => (
            <div key={i} className="tx-bc-row">
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                {shortAddr(b.address, 8, 6)}
              </span>
              <span
                className={"mono tabular " + (b.direction === "in" ? "tx-up" : "tx-down")}
              >
                {b.direction === "in" ? "+" : "-"}
                {b.amount} {b.symbol}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {data.objectChanges.length > 0 ? (
        <div className="tx-objects">
          <div className="eyebrow">Object changes · {data.objectChanges.length}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {data.objectChanges.slice(0, 8).map((o, i) => (
              <span key={i} className="obj-chip">
                <Box size={10} />
                <span className="mono" style={{ fontSize: 10.5 }}>{o.kind}</span>
                {o.type ? (
                  <span style={{ fontSize: 10.5, color: "var(--fg-muted)" }}>
                    · {o.type.split("::").pop()}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <style>{`
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 2px 8px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 999px;
        }
        .sp-dot { width: 5px; height: 5px; border-radius: 50%; }

        .tx-summary {
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--fg);
        }

        .tx-flow {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          align-items: center;
          margin-top: 12px;
          padding: 12px;
          background: color-mix(in oklch, var(--accent) 4%, transparent);
          border: 1px dashed var(--accent-soft);
          border-radius: 8px;
        }
        @media (max-width: 540px) {
          .tx-flow { grid-template-columns: 1fr; gap: 8px; }
        }

        .tx-steps {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tx-steps .eyebrow { margin-bottom: 4px; }

        .ptb-step {
          display: grid;
          grid-template-columns: 22px auto 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 8px 10px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 7px;
        }
        .ptb-idx {
          font-size: 10.5px;
          color: var(--fg-faint);
          text-align: right;
        }
        .ptb-tag {
          font-size: 10px;
          padding: 2px 7px;
          background: var(--bg);
          border: 1px solid;
          border-radius: 4px;
          font-weight: 600;
          letter-spacing: 0.03em;
        }
        .ptb-desc {
          font-size: 12.5px;
          color: var(--fg);
          line-height: 1.45;
        }
        .ptb-mod {
          font-size: 10.5px;
          color: var(--fg-muted);
          padding: 2px 6px;
          background: var(--card);
          border-radius: 3px;
        }

        .tx-bc {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }
        .tx-bc .eyebrow { margin-bottom: 6px; }
        .tx-bc-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 12px;
        }
        .tx-up { color: var(--up); }
        .tx-down { color: var(--down); }

        .tx-objects {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }
        .obj-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 999px;
        }
      `}</style>
    </Card>
  );
}

interface AggregatedChange {
  address: string;
  symbol: string;
  amount: string;
  direction: "in" | "out";
}

function aggregateBalanceChanges(
  changes: ExplainedTx["balanceChanges"],
): AggregatedChange[] {
  // Group by (address, coinType): in changes are positive, out are negative;
  // we surface the net amount + direction per (address, symbol).
  const groups = new Map<string, { sum: number; symbol: string; address: string }>();
  for (const c of changes) {
    const key = `${c.address}::${c.coinType}`;
    const num = Number(c.amount);
    if (!Number.isFinite(num)) continue;
    const signed = c.direction === "in" ? num : -num;
    const existing = groups.get(key);
    if (existing) {
      existing.sum += signed;
    } else {
      groups.set(key, {
        sum: signed,
        symbol: c.symbol ?? c.coinType.split("::").pop() ?? "",
        address: c.address,
      });
    }
  }
  return [...groups.values()]
    .filter((g) => g.sum !== 0)
    .map((g) => ({
      address: g.address,
      symbol: g.symbol,
      amount: Math.abs(g.sum).toLocaleString("en-US", { maximumFractionDigits: 6 }),
      direction: g.sum > 0 ? ("in" as const) : ("out" as const),
    }));
}

function Party({
  label,
  addr,
  icon,
}: {
  label: string;
  addr: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="party">
      <div className="party-icon">{icon}</div>
      <div>
        <div className="eyebrow">{label}</div>
        <div className="mono" style={{ fontSize: 12, fontWeight: 500 }}>
          {shortAddr(addr, 8, 6)}
        </div>
      </div>
      <style>{`
        .party {
          display: flex;
          gap: 8px;
          align-items: center;
          min-width: 0;
        }
        .party-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--bg-elev);
          display: grid;
          place-items: center;
          color: var(--accent);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

function FlowArrow({ steps }: { steps: number }) {
  return (
    <div className="flow-arrow">
      <div className="fa-bar" />
      <div className="fa-pkg mono">{steps} steps</div>
      <div className="fa-tip" />
      <style>{`
        .flow-arrow {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 8px;
        }
        .fa-bar {
          width: 32px;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--accent));
        }
        .fa-pkg {
          font-size: 10px;
          padding: 3px 7px;
          background: var(--bg);
          border: 1px solid var(--accent-soft);
          color: var(--accent);
          border-radius: 999px;
        }
        .fa-tip {
          width: 0;
          height: 0;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          border-left: 7px solid var(--accent);
        }
      `}</style>
    </div>
  );
}
