"use client";

import dynamic from "next/dynamic";
import { ArrowLeftRight } from "lucide-react";
import type { PrepareSwapResult } from "@/lib/tools/prepare-swap";
import { useTheme } from "@/lib/theme";
import { Card, TokenLogo } from "./Card";

// Cetus Terminal ships ~16MB of widget code; load it only when a swap actually
// renders so the initial chat bundle stays lean. ssr:false because the widget
// touches localStorage and window during init.
//
// Import the CJS build directly: the package declares "type": "commonjs" but
// its `module` field points at an ESM file with import/export syntax, which
// Turbopack rejects. Routing through the explicit .cjs.js file dodges the
// conflict without patching the package.
const CetusSwap = dynamic(
  async () => {
    const mod = (await import(
      "@cetusprotocol/terminal/dist/cetus-swap.cjs.js"
    )) as typeof import("@cetusprotocol/terminal");
    return { default: mod.CetusSwap };
  },
  { ssr: false, loading: () => <div className="cetus-loading">Loading swap widget…</div> },
);

export function CetusSwapCard({ data }: { data: PrepareSwapResult }) {
  const { theme } = useTheme();
  const themeType: "Light" | "Dark" = theme === "dark" ? "Dark" : "Light";

  return (
    <Card
      title={
        <>
          <ArrowLeftRight size={14} /> Swap
        </>
      }
      subtitle={
        <span>
          via <span style={{ color: "var(--accent)" }}>Cetus</span> · type the amount in the widget
        </span>
      }
      source="Cetus Aggregator"
    >
      <div className="cs-hint">
        <div className="cs-hint-leg">
          <TokenLogo symbol={data.tokenIn.symbol} size={20} />
          <span className="mono cs-hint-amt">{data.amountInHuman}</span>
          <span className="cs-hint-sym">{data.tokenIn.symbol}</span>
        </div>
        <ArrowLeftRight size={14} className="cs-hint-arrow" />
        <div className="cs-hint-leg">
          <TokenLogo symbol={data.tokenOut.symbol} size={20} />
          <span className="cs-hint-sym">{data.tokenOut.symbol}</span>
        </div>
        <span className="cs-hint-tag">AI suggested · enter amount below</span>
      </div>

      {data.warnings.length > 0 ? (
        <div className="cs-warns">
          {data.warnings.map((w, idx) => (
            <div key={idx} className="cs-warn">
              {w}
            </div>
          ))}
        </div>
      ) : null}

      <div className="cetus-terminal-shell">
        <CetusSwap
          initProps={{
            defaultFromToken: data.tokenIn.coinType,
            defaultToToken: data.tokenOut.coinType,
            defaultSlippage: data.slippagePctText,
            themeType,
          }}
        />
      </div>

      <style>{`
        .cs-hint {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          margin-bottom: 12px;
          background: var(--bg-soft);
          border: 1px solid var(--border);
          border-radius: 8px;
          flex-wrap: wrap;
        }
        .cs-hint-leg {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .cs-hint-amt {
          font-size: 14px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        .cs-hint-sym {
          font-size: 12.5px;
          color: var(--fg-mid);
        }
        .cs-hint-arrow {
          color: var(--accent);
        }
        .cs-hint-tag {
          margin-left: auto;
          font-size: 10.5px;
          color: var(--fg-muted);
          background: color-mix(in oklch, var(--accent) 10%, transparent);
          padding: 3px 8px;
          border-radius: 999px;
        }
        .cs-warns {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 10px;
        }
        .cs-warn {
          font-size: 11.5px;
          padding: 6px 10px;
          background: color-mix(in oklch, var(--warn) 12%, transparent);
          color: var(--warn);
          border-radius: 6px;
        }
        .cetus-terminal-shell {
          /* Terminal renders its own Radix Theme tree; give it a stable
             container so global style bleed (typography, color) stays scoped. */
          isolation: isolate;
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          min-height: 480px;
        }
        .cetus-loading {
          padding: 40px 16px;
          text-align: center;
          font-size: 12.5px;
          color: var(--fg-muted);
        }
      `}</style>
    </Card>
  );
}
