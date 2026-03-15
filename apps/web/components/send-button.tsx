'use client';

import { useEffect, useRef, useState } from 'react';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ResolvedUser } from '@/components/username-input';
import type { TransactionResultData } from '@/components/transaction-result';
import { getCoinDecimals, isValidAmountInput } from '@/lib/coins';

interface SendButtonProps {
  user: ResolvedUser | null;
  amount: string;
  coinType: string;
  onError: (error: string | null) => void;
  onConfirm: (data: TransactionResultData) => void;
}

/** Convert a human-readable amount (e.g. "1.5") to base units (bigint) for a given decimal count. */
function toBaseUnits(amount: string, decimals = 6): bigint {
  const [wholeRaw = '0', frac = ''] = amount.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places`);
  }

  const whole = wholeRaw === '' ? '0' : wholeRaw;
  const paddedFrac = frac.padEnd(decimals, '0');
  return BigInt(`${whole}${paddedFrac}`);
}

function createAbortError() {
  return new DOMException('Request aborted', 'AbortError');
}

function waitForRetryDelay(delayMs: number, signal?: AbortSignal) {
  if (!signal) {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener('abort', handleAbort);
      reject(createAbortError());
    };

    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

/** Retry confirm up to maxRetries times with a delay when server returns 202. */
async function confirmWithRetry(
  txDigest: string,
  quoteToken: string,
  maxRetries = 3,
  delayMs = 2000,
  signal?: AbortSignal,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('/api/v1/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txDigest, quoteToken }),
      signal,
    });

    const data = await res.json();

    if (res.status === 202) {
      // Transaction not yet visible, wait and retry
      if (attempt < maxRetries) {
        await waitForRetryDelay(delayMs, signal);
        continue;
      }
      return { ok: false, data };
    }

    return { ok: res.ok, data };
  }

  return { ok: false, data: { error: 'Confirm timed out' } };
}

export function SendButton({ user, amount, coinType, onError, onConfirm }: SendButtonProps) {
  const [sending, setSending] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const requestControllerRef = useRef<AbortController | null>(null);
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const amountNum = amount === '' ? Number.NaN : Number(amount);
  const hasValidAmount =
    amount !== '' &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    isValidAmountInput(amount, coinType);
  const disabled =
    !account ||
    !user ||
    !hasValidAmount ||
    sending;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestControllerRef.current?.abort();
    };
  }, []);

  const handleSend = async () => {
    if (!account || !user || inFlightRef.current) return;

    const amountNum = amount === '' ? Number.NaN : Number(amount);
    if (amount === '' || Number.isNaN(amountNum) || amountNum <= 0) {
      onError('Enter a valid amount');
      return;
    }
    if (!isValidAmountInput(amount, coinType)) {
      onError(`Amount supports at most ${getCoinDecimals(coinType)} decimal places`);
      return;
    }

    const baseAmount = toBaseUnits(amount, getCoinDecimals(coinType));
    const controller = new AbortController();
    const isAborted = () => controller.signal.aborted || !mountedRef.current;

    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    inFlightRef.current = true;
    setSending(true);
    onError(null);

    try {
      // 1. Request a payment quote
      const quoteRes = await fetch('/api/v1/payments/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          coinType,
          amount: baseAmount.toString(),
          senderAddress: account.address,
        }),
        signal: controller.signal,
      });

      if (isAborted()) return;

      if (!quoteRes.ok) {
        const err = await quoteRes.json().catch(() => ({ error: 'Quote failed' }));
        if (isAborted()) return;
        onError(err.error ?? `Quote error ${quoteRes.status}`);
        return;
      }

      const quote = await quoteRes.json();
      if (isAborted()) return;
      const { quoteToken, vaultAddress } = quote as {
        quoteToken: string;
        vaultAddress: string;
      };

      // 2. Build Sui transaction: transfer coin to vaultAddress
      const tx = new Transaction();
      const coin = tx.add(
        coinWithBalance({
          type: coinType,
          balance: baseAmount,
        }),
      );
      tx.transferObjects([coin], vaultAddress);

      // 3. Sign and execute via dapp-kit
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (isAborted()) return;

      if (result.$kind === 'FailedTransaction') {
        onError('Transaction failed on-chain');
        return;
      }

      const txDigest = result.Transaction.digest;

      // 4. Confirm payment on backend (with retries for 202)
      const confirmResult = await confirmWithRetry(
        txDigest,
        quoteToken,
        3,
        2000,
        controller.signal,
      );
      if (isAborted()) return;

      if (!confirmResult.ok) {
        onError(
          (confirmResult.data.error as string) ??
            'Failed to confirm transaction. It may still be processing.',
        );
        return;
      }

      // 5. Success
      onConfirm({
        amount,
        coinType,
        username: user.username,
        txDigest,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Transaction failed';
      if (!isAborted()) {
        onError(message);
      }
    } finally {
      inFlightRef.current = false;
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (mountedRef.current) {
        setSending(false);
      }
    }
  };

  return (
    <Button
      className="h-16 w-full rounded-[22px] bg-primary text-base font-semibold text-primary-foreground shadow-[0_20px_50px_rgba(91,127,255,0.35)] hover:bg-primary/90"
      size="lg"
      disabled={disabled}
      onClick={handleSend}
    >
      {sending ? (
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="size-5 animate-spin" />
          Sending payment
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          Send now
          <ArrowRight className="size-5" />
        </span>
      )}
    </Button>
  );
}
