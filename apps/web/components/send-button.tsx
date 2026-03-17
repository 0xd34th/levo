'use client';

import { useEffect, useRef, useState } from 'react';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import {
  RecipientConfirmationModal,
  type RecipientConfirmationData,
} from '@/components/recipient-confirmation-modal';
import { Button } from '@/components/ui/button';
import type { TransactionResultData } from '@/components/transaction-result';
import { getCoinDecimals, isValidAmountInput } from '@/lib/coins';
import type { ResolvedUserPreview } from '@/lib/resolved-user';
import { normalizeUsernameInput } from '@/lib/send-form';

interface SendButtonProps {
  username: string;
  amount: string;
  coinType: string;
  /** Privy embedded wallet address. Required for sending. */
  embeddedWalletAddress?: string | null;
  onError: (error: string | null) => void;
  onConfirm: (data: TransactionResultData) => void;
  onSendingChange?: (sending: boolean) => void;
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

type QuoteResponse = {
  quoteToken: string;
} & ResolvedUserPreview;

type SendResponse = {
  status: 'confirmed' | 'pending';
  txDigest: string;
};

type SendStage = 'idle' | 'resolving' | 'reviewing' | 'confirming';

async function getResponseError(response: Response, fallback: string) {
  try {
    const payload = await response.clone().json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string' &&
      payload.error
    ) {
      return payload.error;
    }
  } catch {
    // Fall through to a generic status-aware message when the server response is not JSON.
  }

  return response.status ? `${fallback} (${response.status})` : fallback;
}

function parseQuoteResponse(payload: unknown): QuoteResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const {
    isBlueVerified,
    profilePicture,
    quoteToken,
    username,
    vaultAddress,
  } = payload as Partial<QuoteResponse>;
  if (
    typeof quoteToken !== 'string' ||
    quoteToken === '' ||
    typeof username !== 'string' ||
    username === '' ||
    typeof vaultAddress !== 'string' ||
    vaultAddress === '' ||
    typeof isBlueVerified !== 'boolean' ||
    (profilePicture !== null && typeof profilePicture !== 'string')
  ) {
    return null;
  }

  return {
    isBlueVerified,
    profilePicture,
    quoteToken,
    username,
    vaultAddress,
  };
}

function parseSendResponse(payload: unknown): SendResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { status, txDigest } = payload as Partial<SendResponse>;
  if (
    (status !== 'confirmed' && status !== 'pending') ||
    typeof txDigest !== 'string' ||
    txDigest === ''
  ) {
    return null;
  }

  return { status, txDigest };
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

export function SendButton({
  username,
  amount,
  coinType,
  embeddedWalletAddress,
  onError,
  onConfirm,
  onSendingChange,
}: SendButtonProps) {
  const [sending, setSending] = useState(false);
  const [sendStage, setSendStage] = useState<SendStage>('idle');
  const [confirmationData, setConfirmationData] = useState<RecipientConfirmationData | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const amountNum = amount === '' ? Number.NaN : Number(amount);
  const normalizedUsername = normalizeUsernameInput(username);
  const hasValidAmount =
    amount !== '' &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    isValidAmountInput(amount, coinType);
  const disabled =
    !embeddedWalletAddress ||
    !normalizedUsername ||
    !hasValidAmount ||
    sending;

  const setSendingState = (nextSending: boolean) => {
    setSending(nextSending);
    if (!nextSending) {
      setSendStage('idle');
    }
    onSendingChange?.(nextSending);
  };

  const requestRecipientConfirmation = (data: RecipientConfirmationData) => {
    setConfirmationData(data);
    setSendStage('reviewing');
    return new Promise<boolean>((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  };

  const resolveRecipientConfirmation = (confirmed: boolean) => {
    confirmationResolverRef.current?.(confirmed);
    confirmationResolverRef.current = null;
    setConfirmationData(null);
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      resolveRecipientConfirmation(false);
      requestControllerRef.current?.abort();
    };
  }, []);

  const handleSend = async () => {
    if (!embeddedWalletAddress || !normalizedUsername || inFlightRef.current) return;

    const amountNum = amount === '' ? Number.NaN : Number(amount);
    if (amount === '' || Number.isNaN(amountNum) || amountNum <= 0) {
      onError('Enter a valid amount');
      return;
    }
    if (!isValidAmountInput(amount, coinType)) {
      onError(`Amount supports at most ${getCoinDecimals(coinType)} decimal places`);
      return;
    }

    let senderAddress: string;
    try {
      senderAddress = normalizeSuiAddress(embeddedWalletAddress);
    } catch {
      onError('Invalid wallet address');
      return;
    }

    const baseAmount = toBaseUnits(amount, getCoinDecimals(coinType));
    const controller = new AbortController();
    const isAborted = () => controller.signal.aborted || !mountedRef.current;

    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    inFlightRef.current = true;
    setSendingState(true);
    setSendStage('resolving');
    onError(null);

    try {
      // 1. Request a payment quote, resolving the recipient server-side.
      const quoteRes = await fetch('/api/v1/payments/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalizedUsername,
          coinType,
          amount: baseAmount.toString(),
          senderAddress,
        }),
        signal: controller.signal,
      });

      if (isAborted()) return;

      if (!quoteRes.ok) {
        const error = await getResponseError(quoteRes, 'Quote failed');
        if (isAborted()) return;
        onError(error);
        return;
      }

      const quotePayload = await quoteRes.json().catch(() => null);
      if (isAborted()) return;
      const quote = parseQuoteResponse(quotePayload);
      if (!quote) {
        onError('Invalid quote response');
        return;
      }
      const { quoteToken, ...resolvedRecipient } = quote;

      const confirmed = await requestRecipientConfirmation({
        amount,
        coinType,
        recipient: resolvedRecipient,
      });
      if (isAborted()) return;
      if (!confirmed) {
        return;
      }

      const { username: resolvedUsername } = resolvedRecipient;

      // 2. Server builds, signs, and executes the transaction
      setSendStage('confirming');

      const sendRes = await fetch('/api/v1/payments/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteToken }),
        signal: controller.signal,
      });

      if (isAborted()) return;

      if (!sendRes.ok) {
        const error = await getResponseError(sendRes, 'Send failed');
        if (isAborted()) return;
        onError(error);
        return;
      }

      const sendPayload = await sendRes.json().catch(() => null);
      if (isAborted()) return;
      const sendResult = parseSendResponse(sendPayload);
      if (!sendResult) {
        onError('Invalid send response');
        return;
      }

      if (sendResult.status === 'pending') {
        const confirmResult = await confirmWithRetry(
          sendResult.txDigest,
          quoteToken,
          3,
          2000,
          controller.signal,
        );
        if (isAborted()) return;

        if (!confirmResult.ok) {
          const confirmError =
            typeof confirmResult.data.error === 'string'
              ? confirmResult.data.error
              : 'Failed to confirm transaction. It may still be processing.';
          onError(
            confirmError,
          );
          return;
        }
      }

      onConfirm({
        amount,
        coinType,
        username: resolvedUsername,
        txDigest: sendResult.txDigest,
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
        setSendingState(false);
      }
    }
  };

  let buttonLabel = 'Send now';
  if (sendStage === 'resolving') {
    buttonLabel = 'Resolving recipient';
  } else if (sendStage === 'reviewing') {
    buttonLabel = 'Review recipient';
  } else if (sendStage === 'confirming') {
    buttonLabel = 'Processing payment';
  }

  return (
    <>
      <Button
        className="h-16 w-full rounded-[22px] bg-primary text-base font-semibold text-primary-foreground shadow-[0_20px_50px_rgba(91,127,255,0.35)] hover:bg-primary/90"
        size="lg"
        disabled={disabled}
        onClick={handleSend}
      >
        {sending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-5 animate-spin" />
            {buttonLabel}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            Send now
            <ArrowRight className="size-5" />
          </span>
        )}
      </Button>

      <RecipientConfirmationModal
        data={confirmationData}
        onCancel={() => resolveRecipientConfirmation(false)}
        onConfirm={() => resolveRecipientConfirmation(true)}
      />
    </>
  );
}
