"use client";

import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import type { PrepareTransferResult } from "@/lib/tools/prepare-transfer";
import { Card } from "./Card";
import { shortAddr } from "@/lib/utils";

const SUI_COIN = "0x2::sui::SUI";

export function TransferCard({
  data,
  onReceipt,
}: {
  data: PrepareTransferResult;
  onReceipt?: (digest: string) => void;
}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function execute() {
    if (!account?.address) return;
    setError(null);
    setStatus("submitting");
    try {
      const tx = new Transaction();
      const amount = BigInt(data.amountRaw);
      if (data.coinType === SUI_COIN) {
        const [coin] = tx.splitCoins(tx.gas, [amount]);
        tx.transferObjects([coin], data.recipient);
      } else {
        const coins = await client.getCoins({
          owner: account.address,
          coinType: data.coinType,
          limit: 50,
        });
        if (!coins.data.length) throw new Error("No coins of that type in wallet.");
        const primary = coins.data[0].coinObjectId;
        const rest = coins.data.slice(1).map((c) => c.coinObjectId);
        if (rest.length > 0) tx.mergeCoins(tx.object(primary), rest.map((id) => tx.object(id)));
        const [paid] = tx.splitCoins(tx.object(primary), [amount]);
        tx.transferObjects([paid], data.recipient);
      }
      tx.setSender(account.address);
      const result = await signAndExecute({ transaction: tx });
      setDigest(result.digest);
      setStatus("idle");
      onReceipt?.(result.digest);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <Card title={`Send ${data.amount} ${data.symbol}`} subtitle={`to ${data.recipientResolvedFrom ?? shortAddr(data.recipient)}`}>
      <div className="rounded-md bg-[var(--color-bg-soft)] p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-[var(--color-fg-muted)]">Amount</span>
          <span className="font-medium tabular-nums">{data.amount} {data.symbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--color-fg-muted)]">To</span>
          <code className="text-xs">{data.recipient}</code>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--color-fg-muted)]">Coin</span>
          <code className="text-xs">{data.coinType}</code>
        </div>
      </div>

      {data.warnings.map((w, idx) => (
        <div key={idx} className="mt-2 rounded-md bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300">
          {w}
        </div>
      ))}

      <div className="mt-3">
        {!account ? (
          <div className="rounded-md bg-[var(--color-bg-soft)] p-2 text-center text-xs text-[var(--color-fg-muted)]">
            Connect a wallet to execute.
          </div>
        ) : digest ? (
          <a
            href={`https://suivision.xyz/txblock/${digest}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md bg-[var(--color-up)]/15 p-2 text-center text-xs text-[var(--color-up)]"
          >
            ✓ Sent · {shortAddr(digest, 8, 8)}
          </a>
        ) : (
          <button
            type="button"
            disabled={isPending || status === "submitting"}
            onClick={execute}
            className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting…" : "Sign & send"}
          </button>
        )}
        {error ? (
          <div className="mt-2 rounded-md bg-[var(--color-down)]/15 p-2 text-xs text-[var(--color-down)]">{error}</div>
        ) : null}
      </div>
    </Card>
  );
}
