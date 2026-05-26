"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { MetaAg, EProvider, type MetaQuote } from "@7kprotocol/sdk-ts";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import type { PrepareSwapResult } from "@/lib/tools/prepare-swap";
import { Card, TokenLogo } from "./Card";
import { shortAddr } from "@/lib/utils";

const SLIPPAGE_PRESETS_BPS = [10, 50, 100];
const QUOTE_REFRESH_MS = 30_000;

const PROVIDER_LABEL: Record<MetaQuote["provider"], string> = {
  [EProvider.BLUEFIN7K]: "Bluefin7K",
  [EProvider.CETUS]: "Cetus",
  [EProvider.FLOWX]: "FlowX",
  [EProvider.OKX]: "OKX",
};

function formatUnits(raw: string, decimals: number): string {
  if (!raw) return "—";
  const padded = raw.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "");
  const intFmt = Number(intPart).toLocaleString("en-US");
  return fracPart ? `${intFmt}.${fracPart}` : intFmt;
}

function bpsToPct(bps: number): string {
  return (bps / 100).toString();
}

export function SwapCard({
  data,
  onReceipt,
}: {
  data: PrepareSwapResult;
  onReceipt?: (digest: string) => void;
}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [slippageBps, setSlippageBps] = useState(data.slippageBps);
  const [customSlippage, setCustomSlippage] = useState("");
  const [bestQuote, setBestQuote] = useState<MetaQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const metaAg = useMemo(() => new MetaAg(), []);
  const reqIdRef = useRef(0);

  const amountInRaw = data.amountInRaw;
  const amountValid = amountInRaw !== "";

  // Quote: refetch on inputs / signer / refreshTick; auto-refresh every 30s.
  useEffect(() => {
    if (!amountValid || !account?.address) {
      setQuoting(false);
      setQuoteError(null);
      setBestQuote(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    let cancelled = false;
    setQuoting(true);
    setQuoteError(null);
    (async () => {
      try {
        const quotes = await metaAg.quote({
          coinTypeIn: data.tokenIn.coinType,
          coinTypeOut: data.tokenOut.coinType,
          amountIn: amountInRaw,
          signer: account.address,
        });
        if (cancelled || myReq !== reqIdRef.current) return;
        const usable = quotes
          .filter((q) => q.provider !== EProvider.OKX)
          .sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : -1));
        setBestQuote(usable[0] ?? null);
        if (!usable.length) setQuoteError("No route available right now.");
      } catch (e) {
        if (!cancelled && myReq === reqIdRef.current) {
          setQuoteError((e as Error).message);
          setBestQuote(null);
        }
      } finally {
        if (!cancelled && myReq === reqIdRef.current) setQuoting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    amountValid,
    amountInRaw,
    data.tokenIn.coinType,
    data.tokenOut.coinType,
    account?.address,
    metaAg,
    refreshTick,
  ]);

  useEffect(() => {
    const t = setInterval(() => setRefreshTick((n) => n + 1), QUOTE_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Balance check on connect / token / amount change.
  useEffect(() => {
    if (!account?.address || !amountValid) {
      setInsufficient(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const bal = await client.getBalance({
          owner: account.address,
          coinType: data.tokenIn.coinType,
        });
        if (cancelled) return;
        setInsufficient(BigInt(bal.totalBalance) < BigInt(amountInRaw));
      } catch {
        if (!cancelled) setInsufficient(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.address, data.tokenIn.coinType, amountInRaw, amountValid, client]);

  const slippagePctLabel = useMemo(() => `${bpsToPct(slippageBps)}%`, [slippageBps]);
  const amountOutHuman = bestQuote
    ? formatUnits(bestQuote.amountOut, data.tokenOut.decimals)
    : "—";

  function selectPreset(bps: number) {
    setSlippageBps(bps);
    setCustomSlippage("");
  }

  function applyCustomSlippage(value: string) {
    setCustomSlippage(value);
    if (value === "") return;
    const pct = Number(value);
    if (Number.isFinite(pct) && pct > 0 && pct <= 50) {
      setSlippageBps(Math.round(pct * 100));
    }
  }

  async function execute() {
    if (!account?.address || !bestQuote) return;
    setError(null);
    setSubmitting(true);
    try {
      const tx = new Transaction();
      const coinIn = coinWithBalance({
        balance: BigInt(amountInRaw),
        type: data.tokenIn.coinType,
      });
      const coinOut = await metaAg.swap(
        {
          quote: bestQuote,
          signer: account.address,
          tx,
          coinIn,
        },
        slippageBps,
      );
      tx.transferObjects([coinOut], account.address);
      tx.setSender(account.address);
      const result = await signAndExecute({ transaction: tx });
      setDigest(result.digest);
      onReceipt?.(result.digest);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const buttonDisabled =
    !account ||
    !bestQuote ||
    insufficient ||
    !amountValid ||
    submitting ||
    isPending ||
    quoting;

  return (
    <Card
      title={
        <>
          <ArrowLeftRight size={14} />
          Swap {data.amountInHuman} {data.tokenIn.symbol} → {data.tokenOut.symbol}
        </>
      }
      subtitle={
        <span>
          via{" "}
          <span style={{ color: "var(--accent)" }}>7K meta-aggregator</span>
          {bestQuote ? ` · best route: ${PROVIDER_LABEL[bestQuote.provider]}` : ""}
        </span>
      }
      source="7K Aggregator"
    >
      <div className="rounded-md bg-[var(--color-bg-soft)] p-3 text-sm space-y-2">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-[var(--color-fg-muted)]">
            <TokenLogo symbol={data.tokenIn.symbol} size={18} />
            You pay
          </span>
          <span className="font-medium tabular-nums">
            {data.amountInHuman} {data.tokenIn.symbol}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-[var(--color-fg-muted)]">
            <TokenLogo symbol={data.tokenOut.symbol} size={18} />
            You receive (est.)
          </span>
          <span className="font-medium tabular-nums flex items-center gap-1.5">
            {quoting ? (
              <span className="text-[var(--color-fg-muted)] text-xs">quoting…</span>
            ) : (
              <>
                {amountOutHuman} {data.tokenOut.symbol}
              </>
            )}
            <button
              type="button"
              onClick={() => setRefreshTick((n) => n + 1)}
              className="ml-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-50"
              disabled={quoting || submitting}
              aria-label="Refresh quote"
              title="Refresh quote"
            >
              <RefreshCw size={12} className={quoting ? "animate-spin" : ""} />
            </button>
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[var(--color-fg-muted)]">Slippage</span>
          <div className="flex items-center gap-1.5">
            {SLIPPAGE_PRESETS_BPS.map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => selectPreset(bps)}
                className={`rounded px-1.5 py-0.5 text-xs transition ${
                  slippageBps === bps && customSlippage === ""
                    ? "bg-[var(--color-accent)] text-[var(--color-bg)]"
                    : "bg-[var(--color-bg)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                {bpsToPct(bps)}%
              </button>
            ))}
            <input
              type="text"
              inputMode="decimal"
              value={customSlippage}
              onChange={(e) => applyCustomSlippage(e.target.value)}
              placeholder={customSlippage ? "" : slippagePctLabel}
              className="w-12 rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              aria-label="Custom slippage percentage"
            />
            <span className="text-xs text-[var(--color-fg-muted)]">%</span>
          </div>
        </div>
      </div>

      {data.warnings.map((w, idx) => (
        <div
          key={idx}
          className="mt-2 rounded-md bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300"
        >
          {w}
        </div>
      ))}

      {quoteError ? (
        <div className="mt-2 rounded-md bg-[var(--color-down)]/15 p-2 text-xs text-[var(--color-down)]">
          Quote failed: {quoteError}
        </div>
      ) : null}
      {insufficient ? (
        <div className="mt-2 rounded-md bg-[var(--color-down)]/15 p-2 text-xs text-[var(--color-down)]">
          Insufficient {data.tokenIn.symbol} balance.
        </div>
      ) : null}

      <div className="mt-3">
        {!account ? (
          <div className="rounded-md bg-[var(--color-bg-soft)] p-2 text-center text-xs text-[var(--color-fg-muted)]">
            Connect a wallet to swap.
          </div>
        ) : digest ? (
          <a
            href={`https://suivision.xyz/txblock/${digest}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md bg-[var(--color-up)]/15 p-2 text-center text-xs text-[var(--color-up)]"
          >
            ✓ Swapped · {shortAddr(digest, 8, 8)}
          </a>
        ) : (
          <button
            type="button"
            disabled={buttonDisabled}
            onClick={execute}
            className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] disabled:opacity-50"
          >
            {submitting
              ? "Submitting…"
              : insufficient
                ? "Insufficient balance"
                : !bestQuote
                  ? quoting
                    ? "Fetching quote…"
                    : "No quote"
                  : `Sign & swap (${slippagePctLabel} slip)`}
          </button>
        )}
        {error ? (
          <div className="mt-2 rounded-md bg-[var(--color-down)]/15 p-2 text-xs text-[var(--color-down)]">
            {error}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
