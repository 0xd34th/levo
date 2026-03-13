'use client';

import { useState } from 'react';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import { Button } from '@/components/ui/button';
import type { ResolvedUser } from '@/components/handle-input';
import type { ConfirmationData } from '@/components/confirmation-modal';

interface SendButtonProps {
  user: ResolvedUser | null;
  amount: string;
  coinType: string;
  onError: (error: string | null) => void;
  onConfirm: (data: ConfirmationData) => void;
}

/** Convert a human-readable amount (e.g. "1.5") to base units (bigint) for a given decimal count. */
function toBaseUnits(amount: string, decimals = 6): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

/** Retry confirm up to maxRetries times with a delay when server returns 202. */
async function confirmWithRetry(
  txDigest: string,
  quoteToken: string,
  maxRetries = 3,
  delayMs = 2000,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('/api/v1/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txDigest, quoteToken }),
    });

    const data = await res.json();

    if (res.status === 202) {
      // Transaction not yet visible, wait and retry
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
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
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();

  const amountNum = parseFloat(amount || '0');
  const disabled = !account || !user || amountNum <= 0 || sending;

  const handleSend = async () => {
    if (!account || !user) return;

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
          amount: toBaseUnits(amount).toString(),
          senderAddress: account.address,
        }),
      });

      if (!quoteRes.ok) {
        const err = await quoteRes.json().catch(() => ({ error: 'Quote failed' }));
        onError(err.error ?? `Quote error ${quoteRes.status}`);
        return;
      }

      const quote = await quoteRes.json();
      const { quoteToken, vaultAddress } = quote as {
        quoteToken: string;
        vaultAddress: string;
      };

      // 2. Build Sui transaction: transfer coin to vaultAddress
      const tx = new Transaction();
      const coin = tx.add(
        coinWithBalance({
          type: coinType,
          balance: toBaseUnits(amount),
        }),
      );
      tx.transferObjects([coin], vaultAddress);

      // 3. Sign and execute via dapp-kit
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      if (result.$kind === 'FailedTransaction') {
        onError('Transaction failed on-chain');
        return;
      }

      const txDigest = result.Transaction.digest;

      // 4. Confirm payment on backend (with retries for 202)
      const confirmResult = await confirmWithRetry(txDigest, quoteToken);

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
        username: user.username,
        txDigest,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      onError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      className="w-full"
      size="lg"
      disabled={disabled}
      onClick={handleSend}
    >
      {sending ? 'Sending...' : 'Send'}
    </Button>
  );
}
