"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import { ThemeToggle } from "./ThemeToggle";

interface SuiPriceState {
  symbol: string;
  price: number;
  priceChange24H?: number;
}

export function Header() {
  const [price, setPrice] = useState<SuiPriceState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const pRes = await fetch("/api/sui-price").then((r) => (r.ok ? r.json() : null));
        if (cancelled) return;
        if (pRes) setPrice(pRes as SuiPriceState);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const interval = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="aisui-header">
      <div className="aisui-header-l">
        <Logo />
        {price && typeof price.price === "number" ? (
          <SuiPriceChip price={price.price} change={price.priceChange24H} />
        ) : null}
      </div>
      <div className="aisui-header-r">
        <ThemeToggle />
        <div className="aisui-wallet-slot">
          <ConnectButton connectText="Connect wallet" />
        </div>
      </div>

      <style>{`
        .aisui-header {
          height: 56px;
          padding: 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border);
          background: color-mix(in oklch, var(--bg) 85%, transparent);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 40;
        }
        .aisui-header-l { display: flex; align-items: center; gap: 14px; }
        .aisui-header-r { display: flex; align-items: center; gap: 10px; }

        /* Subtle restyle of dapp-kit's ConnectButton to match the design's wallet pill.
           Use --fg for the label so the truncated address stays high-contrast in
           dark mode (--accent at 78% lightness over a dark bg failed WCAG). */
        .aisui-wallet-slot :where(button) {
          font-size: 12px !important;
          font-weight: 500 !important;
          padding: 6px 12px !important;
          border-radius: 999px !important;
          border: 1px solid var(--accent-soft) !important;
          background: color-mix(in oklch, var(--accent) 12%, transparent) !important;
          color: var(--fg) !important;
          line-height: 1.2 !important;
          height: auto !important;
          min-height: 0 !important;
          box-shadow: none !important;
        }
        .aisui-wallet-slot :where(button) :where(*) {
          color: inherit !important;
        }
        .aisui-wallet-slot :where(button):hover {
          background: color-mix(in oklch, var(--accent) 18%, transparent) !important;
        }
      `}</style>
    </header>
  );
}

function Logo() {
  return (
    <div className="aisui-logo">
      <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden>
        <defs>
          <linearGradient id="aisui-lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="oklch(82% 0.13 220)" />
            <stop offset="1" stopColor="oklch(60% 0.16 230)" />
          </linearGradient>
        </defs>
        <path
          d="M14 3.5c2.5 4.5 7 6 7 11.5a7 7 0 1 1-14 0c0-5.5 4.5-7 7-11.5z"
          fill="url(#aisui-lg)"
        />
        <circle cx="14" cy="15.5" r="3" fill="var(--bg)" />
      </svg>
      <span className="aisui-logo-text">
        ai<span style={{ color: "var(--accent)" }}>sui</span>
      </span>
      <style>{`
        .aisui-logo { display: flex; align-items: center; gap: 8px; }
        .aisui-logo-text { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
      `}</style>
    </div>
  );
}

function SuiPriceChip({ price, change }: { price: number; change?: number }) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="sui-chip">
      <span className="eyebrow" style={{ margin: 0 }}>SUI</span>
      <span className="mono tabular" style={{ fontSize: 12, fontWeight: 500 }}>
        ${price.toFixed(2)}
      </span>
      {change !== undefined ? (
        <span
          className="mono tabular"
          style={{
            fontSize: 11,
            color: up ? "var(--up)" : "var(--down)",
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          {up ? <Triangle dir="up" /> : <Triangle dir="down" />}
          {Math.abs(change).toFixed(2)}%
        </span>
      ) : null}
      <style>{`
        .sui-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 10px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--bg-soft);
        }
        @media (max-width: 640px) {
          .sui-chip { display: none; }
        }
      `}</style>
    </div>
  );
}

function Triangle({ dir }: { dir: "up" | "down" }) {
  return dir === "up" ? (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 5l8 10H4z" />
    </svg>
  ) : (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 19 4 9h16z" />
    </svg>
  );
}
