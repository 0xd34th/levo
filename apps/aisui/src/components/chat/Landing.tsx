"use client";

import { Zap, Box, ArrowLeftRight, Sparkles } from "lucide-react";
import { ChipRow, FootStat, type Chip, type PresetCommand } from "./ChipBar";

interface LandingProps {
  onPick: (command: PresetCommand) => void;
}

const MARKETS: Chip[] = [
  { emoji: "📈", label: "SUI price", command: { kind: "prompt", prompt: "How is SUI performing today?" } },
  {
    emoji: "🔥",
    label: "Trending coins",
    command: { kind: "prompt", prompt: "What coins are trending on Sui in the last 24 hours?" },
  },
  {
    emoji: "🏊",
    label: "Top DEX pools",
    command: { kind: "prompt", prompt: "Show me the top DEX pools on Sui by volume." },
  },
];

const WALLET: Chip[] = [
  { emoji: "💼", label: "My portfolio", command: { kind: "prompt", prompt: "Show me my portfolio" } },
  { emoji: "📜", label: "Recent activity", command: { kind: "prompt", prompt: "Show my recent activity" } },
  { emoji: "🌊", label: "DeFi positions", command: { kind: "prompt", prompt: "Show my DeFi positions" } },
];

const ONCHAIN: Chip[] = [
  { emoji: "🧊", label: "Object lookup", command: { kind: "onchain", preset: "object" } },
  { emoji: "🔍", label: "Explain a digest", command: { kind: "onchain", preset: "digest" } },
  { emoji: "🖼", label: "NFT collection", command: { kind: "onchain", preset: "collection" } },
];

const TRADE: Chip[] = [
  { emoji: "🔄", label: "Swap 1 SUI → USDC", command: { kind: "surface", surface: "swap" } },
  { emoji: "✈️", label: "Send to a .sui name", command: { kind: "surface", surface: "send" } },
  { emoji: "🌉", label: "Bridge to Sui", command: { kind: "surface", surface: "bridge" } },
];

export function Landing({ onPick }: LandingProps) {
  return (
    <div className="landing-wrap">
      <div className="grid-bg landing-grid" aria-hidden />

      <div className="landing-eyebrow rise" style={{ animationDelay: "0ms" }}>
        <span className="le-dot pulse" />
        <span className="eyebrow">AI explorer for Sui · alpha</span>
      </div>

      <h1 className="landing-h1 rise" style={{ animationDelay: "60ms" }}>
        Ask anything <br />
        about <span className="grad-aqua">Sui</span>.
      </h1>
      <p className="landing-sub rise" style={{ animationDelay: "120ms" }}>
        Tokens, portfolios, objects, transactions, swaps — explained and executable, in chat.
      </p>

      <div className="landing-chips rise" style={{ animationDelay: "240ms" }}>
        <ChipRow label="Markets" chips={MARKETS} onPick={onPick} />
        <ChipRow label="Wallet" chips={WALLET} onPick={onPick} />
        <ChipRow label="On-chain" chips={ONCHAIN} onPick={onPick} />
        <ChipRow label="Trade" chips={TRADE} onPick={onPick} />
      </div>

      <div className="landing-foot rise" style={{ animationDelay: "320ms" }}>
        <FootStat icon={<Zap size={11} />} label="Sub-second streaming" />
        <FootStat icon={<Box size={11} />} label="Sui-native: PTB, Objects, SuiNS" />
        <FootStat icon={<ArrowLeftRight size={11} />} label="7K SwapCard routing" />
        <FootStat icon={<Sparkles size={11} />} label="No app message cap" />
      </div>

      <style>{`
        .landing-wrap {
          position: relative;
          max-width: 720px;
          margin: 0 auto;
          padding: 32px 16px 64px;
          text-align: center;
        }
        .landing-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .landing-wrap > *:not(.landing-grid) { position: relative; z-index: 1; }

        .landing-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 12px;
          border: 1px solid var(--border);
          background: var(--bg-soft);
          border-radius: 999px;
          margin-top: 32px;
          margin-bottom: 24px;
        }
        .le-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 10px var(--accent);
        }
        .landing-h1 {
          font-size: 56px;
          line-height: 0.98;
          letter-spacing: -0.035em;
          font-weight: 600;
          margin: 0;
          color: var(--fg);
        }
        .grad-aqua {
          background: linear-gradient(135deg, oklch(82% 0.13 220), oklch(70% 0.16 220));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .landing-sub {
          margin: 18px auto 32px;
          max-width: 480px;
          font-size: 15px;
          line-height: 1.5;
          color: var(--fg-muted);
        }
        .landing-chips {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 600px;
          margin: 0 auto;
          text-align: left;
        }
        .landing-foot {
          display: flex;
          justify-content: center;
          gap: 22px;
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
          flex-wrap: wrap;
        }

        @media (max-width: 640px) {
          .landing-h1 { font-size: 40px; }
          .landing-sub { font-size: 14px; }
        }
      `}</style>
    </div>
  );
}
