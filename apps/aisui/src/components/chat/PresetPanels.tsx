"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeftRight, ExternalLink, Send, Search } from "lucide-react";
import { SwapCard } from "@/components/cards/SwapCard";
import { TransferCard } from "@/components/cards/TransferCard";
import type { PrepareSwapResult } from "@/lib/tools/prepare-swap";
import type { PrepareTransferResult } from "@/lib/tools/prepare-transfer";

const SUI_COIN = "0x2::sui::SUI";
const NATIVE_USDC =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const SUI_BRIDGE_URL = "https://bridge.sui.io/";
const SEND_COIN_OPTIONS = [
  { symbol: "SUI", label: "SUI", coinType: SUI_COIN },
  { symbol: "USDC", label: "USDC", coinType: NATIVE_USDC },
] as const;

export type OnchainPreset = "object" | "digest" | "collection";
export type TradeSurface = "swap" | "send" | "bridge";

interface PresetPanelProps {
  onchainPreset: OnchainPreset | null;
  tradeSurface: TradeSurface | null;
  onPrompt: (prompt: string) => void;
  onReceipt: (digest: string) => void;
}

export function PresetPanel({
  onchainPreset,
  tradeSurface,
  onPrompt,
  onReceipt,
}: PresetPanelProps) {
  if (onchainPreset) {
    return <OnchainPanel preset={onchainPreset} onPrompt={onPrompt} />;
  }
  if (tradeSurface === "swap") {
    return <SwapPresetPanel onReceipt={onReceipt} />;
  }
  if (tradeSurface === "send") {
    return <SendPresetPanel onReceipt={onReceipt} />;
  }
  if (tradeSurface === "bridge") {
    return <BridgePresetPanel />;
  }
  return null;
}

function OnchainPanel({
  preset,
  onPrompt,
}: {
  preset: OnchainPreset;
  onPrompt: (prompt: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const meta = ONCHAIN_META[preset];
  const valid = meta.validate(trimmed);

  return (
    <PanelShell title={meta.title} icon={<Search className="size-4" />}>
      <label className="preset-label">
        <span>{meta.inputLabel}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="preset-input"
          placeholder={meta.placeholder}
        />
      </label>
      <div className="preset-actions">
        <button
          type="button"
          className="preset-primary"
          disabled={!valid}
          onClick={() => onPrompt(meta.prompt(trimmed))}
        >
          Ask AI
        </button>
      </div>
      <PresetStyles />
    </PanelShell>
  );
}

const ONCHAIN_META: Record<
  OnchainPreset,
  {
    title: string;
    inputLabel: string;
    placeholder: string;
    validate: (value: string) => boolean;
    prompt: (value: string) => string;
  }
> = {
  object: {
    title: "Object lookup",
    inputLabel: "Object ID",
    placeholder: "0x6",
    validate: (value) => /^0x[0-9a-fA-F]+$/.test(value),
    prompt: (value) => `What is the Sui object ${value}?`,
  },
  digest: {
    title: "Explain transaction",
    inputLabel: "Transaction digest",
    placeholder: "Base58 transaction digest",
    validate: (value) => /^[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(value),
    prompt: (value) => `Explain transaction ${value}`,
  },
  collection: {
    title: "NFT collection lookup",
    inputLabel: "Collection type",
    placeholder: "0x...::module::Collection",
    validate: isMoveType,
    prompt: (value) => `Show me the NFT collection ${value}`,
  },
};

function isMoveType(value: string) {
  return /^0x[0-9a-fA-F]+::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*(?:<.+>)?$/.test(value);
}

function SwapPresetPanel({ onReceipt }: { onReceipt: (digest: string) => void }) {
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState("50");
  const [data, setData] = useState<PrepareSwapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReview = Number(amountIn) > 0 && Number(slippageBps) > 0;

  async function review() {
    if (!canReview) return;
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/prepare-swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenIn: SUI_COIN,
          tokenOut: NATIVE_USDC,
          amountIn: amountIn.trim(),
          slippageBps: Number(slippageBps),
        }),
      });
      const body = (await res.json()) as PrepareSwapResult | { message?: string; error?: string };
      if (!res.ok) throw new Error("message" in body ? body.message ?? body.error : "Swap review failed");
      setData(body as PrepareSwapResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell title="Direct swap review" icon={<ArrowLeftRight className="size-4" />}>
      <div className="preset-grid">
        <label className="preset-label">
          <span>Amount</span>
          <input
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            className="preset-input"
            inputMode="decimal"
          />
        </label>
        <label className="preset-label">
          <span>Slippage bps</span>
          <input
            value={slippageBps}
            onChange={(e) => setSlippageBps(e.target.value)}
            className="preset-input"
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="preset-summary">SUI to native USDC</div>
      <div className="preset-actions">
        <button type="button" className="preset-primary" disabled={!canReview || busy} onClick={review}>
          {busy ? "Reviewing..." : "Review swap"}
        </button>
      </div>
      {error ? <div className="preset-error">{error}</div> : null}
      {data ? (
        <div className="preset-result">
          <SwapCard data={data} onReceipt={onReceipt} />
        </div>
      ) : null}
      <PresetStyles />
    </PanelShell>
  );
}

function SendPresetPanel({ onReceipt }: { onReceipt: (digest: string) => void }) {
  const [coinType, setCoinType] = useState<string>(SUI_COIN);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [data, setData] = useState<PrepareTransferResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCoin = SEND_COIN_OPTIONS.find((coin) => coin.coinType === coinType) ?? SEND_COIN_OPTIONS[0];

  const canReview = amount.trim() !== "" && recipient.trim() !== "";

  async function review() {
    if (!canReview) return;
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/prepare-transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toAddressOrName: recipient.trim(),
          coinType,
          amount: amount.trim(),
        }),
      });
      const body = (await res.json()) as PrepareTransferResult | { message?: string; error?: string };
      if (!res.ok) throw new Error("message" in body ? body.message ?? body.error : "Send review failed");
      setData(body as PrepareTransferResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelShell title="Direct send review" icon={<Send className="size-4" />}>
      <div className="preset-fieldset">
        <div className="preset-label-text">Coin</div>
        <div className="preset-segmented" role="radiogroup" aria-label="Coin">
          {SEND_COIN_OPTIONS.map((coin) => (
            <button
              key={coin.coinType}
              type="button"
              role="radio"
              aria-checked={coinType === coin.coinType}
              className={coinType === coin.coinType ? "preset-segment active" : "preset-segment"}
              onClick={() => {
                setCoinType(coin.coinType);
                setData(null);
                setError(null);
              }}
            >
              {coin.label}
            </button>
          ))}
        </div>
      </div>
      <div className="preset-grid">
        <label className="preset-label">
          <span>Amount</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="preset-input"
            inputMode="decimal"
          />
        </label>
        <label className="preset-label">
          <span>Recipient</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="preset-input"
            placeholder="0x... or name.sui"
          />
        </label>
      </div>
      <div className="preset-summary">Coin: {selectedCoin.symbol}</div>
      <div className="preset-actions">
        <button type="button" className="preset-primary" disabled={!canReview || busy} onClick={review}>
          {busy ? "Reviewing..." : "Review send"}
        </button>
      </div>
      {error ? <div className="preset-error">{error}</div> : null}
      {data ? (
        <div className="preset-result">
          <TransferCard data={data} onReceipt={onReceipt} />
        </div>
      ) : null}
      <PresetStyles />
    </PanelShell>
  );
}

function BridgePresetPanel() {
  const [amount, setAmount] = useState("");
  const [sourceToken, setSourceToken] = useState("ETH");
  const [reviewed, setReviewed] = useState(false);
  const canReview = Number(amount) > 0 && sourceToken.trim() !== "";
  const summary = useMemo(
    () => `${amount.trim() || "Amount"} ${sourceToken.trim() || "ETH"} via official Sui Bridge`,
    [amount, sourceToken],
  );

  return (
    <PanelShell title="Bridge handoff" icon={<ExternalLink className="size-4" />}>
      <div className="preset-grid">
        <label className="preset-label">
          <span>Amount</span>
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setReviewed(false);
            }}
            className="preset-input"
            inputMode="decimal"
            placeholder="0.5"
          />
        </label>
        <label className="preset-label">
          <span>Source token</span>
          <input
            value={sourceToken}
            onChange={(e) => {
              setSourceToken(e.target.value);
              setReviewed(false);
            }}
            className="preset-input"
          />
        </label>
      </div>
      <div className="preset-summary">{summary}</div>
      <div className="preset-actions">
        {!reviewed ? (
          <button
            type="button"
            className="preset-primary"
            disabled={!canReview}
            onClick={() => setReviewed(true)}
          >
            Review handoff
          </button>
        ) : (
          <button
            type="button"
            className="preset-primary"
            onClick={() => window.open(SUI_BRIDGE_URL, "_blank", "noopener,noreferrer")}
          >
            Open Sui Bridge
          </button>
        )}
      </div>
      <PresetStyles />
    </PanelShell>
  );
}

function PanelShell({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="preset-panel" aria-label={title}>
      <div className="preset-title">
        {icon}
        <span>{title}</span>
      </div>
      {children}
      <style>{`
        .preset-panel {
          width: 100%;
          border: 1px solid var(--border);
          background: var(--card);
          border-radius: var(--r-lg);
          box-shadow: var(--shadow-card);
          padding: 14px;
        }
        .preset-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--fg);
          margin-bottom: 12px;
        }
      `}</style>
    </section>
  );
}

function PresetStyles() {
  return (
    <style>{`
      .preset-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .preset-label {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
        font-size: 11.5px;
        color: var(--fg-muted);
      }
      .preset-fieldset {
        display: grid;
        gap: 6px;
        margin-bottom: 10px;
      }
      .preset-label-text {
        font-size: 11.5px;
        color: var(--fg-muted);
      }
      .preset-segmented {
        display: inline-flex;
        width: fit-content;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg-soft);
      }
      .preset-segment {
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--fg-muted);
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .preset-segment.active {
        background: var(--card-hi);
        color: var(--fg);
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
      }
      .preset-input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg);
        color: var(--fg);
        padding: 8px 9px;
        font-size: 13px;
        outline: none;
      }
      .preset-input:focus {
        border-color: var(--accent-soft);
        box-shadow: 0 0 0 3px var(--accent-glow);
      }
      .preset-summary {
        margin-top: 10px;
        color: var(--fg-muted);
        font-size: 12px;
      }
      .preset-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 12px;
      }
      .preset-primary {
        border: 0;
        border-radius: 8px;
        background: var(--accent);
        color: var(--on-accent);
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .preset-primary:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .preset-error {
        margin-top: 10px;
        padding: 8px 9px;
        border-radius: 8px;
        background: color-mix(in oklch, var(--color-down) 15%, transparent);
        color: var(--color-down);
        font-size: 12px;
      }
      .preset-result {
        margin-top: 12px;
      }
      @media (max-width: 560px) {
        .preset-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
