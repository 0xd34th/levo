"use client";

import { Zap, Box, ArrowLeftRight, Sparkles } from "lucide-react";
import { ChipRow, FootStat, type Chip } from "./ChipBar";

interface LandingProps {
  onPick: (prompt: string) => void;
}

const MARKETS: Chip[] = [
  { emoji: "📈", label: "SUI price", prompt: "How is SUI performing today?" },
  { emoji: "🔥", label: "Trending coins", prompt: "What coins are trending on Sui in the last 24 hours?" },
  { emoji: "🏊", label: "Top DEX pools", prompt: "Show me the top DEX pools on Sui by volume." },
  { emoji: "🎁", label: "New listings", prompt: "What new tokens were listed on Sui this week?" },
];

const WALLET: Chip[] = [
  { emoji: "💼", label: "My portfolio", prompt: "Show me my portfolio" },
  { emoji: "📜", label: "Recent activity", prompt: "Show my recent activity" },
  { emoji: "🌊", label: "DeFi positions", prompt: "Show my DeFi positions" },
];

const ONCHAIN: Chip[] = [
  { emoji: "🧊", label: "Object 0x6 (clock)", prompt: "What is the Sui object 0x6 (clock)?" },
  { emoji: "🔍", label: "Explain a digest", prompt: "Explain transaction 7Hd9PZ8M3rTQfNvL5Yk2WqJpRn4XbAjC1uVeF6Gx" },
  { emoji: "🖼", label: "NFT collection", prompt: "Show me the Suipanda NFT collection" },
];

const TRADE: Chip[] = [
  { emoji: "🔄", label: "Swap 1 SUI → USDC", prompt: "Quote me a swap of 1 SUI to USDC" },
  { emoji: "✈️", label: "Send to a .sui name", prompt: "Send 1 SUI to alice.sui" },
  { emoji: "🌉", label: "Bridge from ETH", prompt: "Bridge 0.1 ETH from Ethereum to Sui" },
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
        <FootStat icon={<ArrowLeftRight size={11} />} label="7K + OKX dual-source quotes" />
        <FootStat icon={<Sparkles size={11} />} label="10 free messages / day" />
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
