'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useAuthorizationSignature,
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import {
  RecipientConfirmationModal,
  type RecipientConfirmationData,
} from '@/components/recipient-confirmation-modal';
import { Button } from '@/components/ui/button';
import type { TransactionResultData } from '@/components/transaction-result';
import { formatAmount, getCoinDecimals, getCoinLabel, isValidAmountInput } from '@/lib/coins';
import { parsePrivyAuthorizationRequiredResponse } from '@/lib/privy-authorization';
import {
  privyAuthenticatedFetch,
} from '@/lib/privy-fetch';
import type { RecipientType } from '@/lib/recipient';
import { isValidSuiAddressInput } from '@/lib/recipient';
import type { ResolvedUserPreview } from '@/lib/resolved-user';
import { normalizeUsernameInput } from '@/lib/send-form';

interface SendButtonProps {
  username: string;
  amount: string;
  coinType: string;
  recipientType: RecipientType | null;
  /** Privy embedded wallet address. Required for sending. */
  embeddedWalletAddress?: string | null;
  /** Raw balance in base units for the selected coin type. */
  availableBalance?: string | null;
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

type XHandleQuoteResponse = {
  recipientType?: 'X_HANDLE';
  quoteToken: string;
} & ResolvedUserPreview;

type SuiAddressQuoteResponse = {
  recipientType: 'SUI_ADDRESS';
  recipientAddress: string;
  quoteToken: string;
};

type QuoteResponse = XHandleQuoteResponse | SuiAddressQuoteResponse;

type SendResponse = {
  status: 'confirmed' | 'pending';
  txDigest: string;
};

type SendStage = 'idle' | 'resolving' | 'reviewing' | 'authorizing' | 'confirming';

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

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function parseQuoteResponse(payload: unknown, expectedType: RecipientType): QuoteResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const obj = payload as Record<string, unknown>;

  if (expectedType === 'SUI_ADDRESS') {
    if (
      typeof obj.quoteToken !== 'string' || obj.quoteToken === '' ||
      typeof obj.recipientAddress !== 'string' || obj.recipientAddress === ''
    ) {
      return null;
    }
    return {
      recipientType: 'SUI_ADDRESS',
      recipientAddress: obj.recipientAddress as string,
      quoteToken: obj.quoteToken as string,
    };
  }

  // X_HANDLE response
  const {
    isBlueVerified,
    profilePicture,
    quoteToken,
    username,
    vaultAddress,
  } = obj as Partial<XHandleQuoteResponse>;
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
  recipientType,
  embeddedWalletAddress,
  availableBalance,
  onError,
  onConfirm,
  onSendingChange,
}: SendButtonProps) {
  const { getAccessToken } = usePrivy();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const { identityToken } = useIdentityToken();
  const [sending, setSending] = useState(false);
  const [sendStage, setSendStage] = useState<SendStage>('idle');
  const [confirmationData, setConfirmationData] = useState<RecipientConfirmationData | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const amountNum = amount === '' ? Number.NaN : Number(amount);
  const normalizedUsername = normalizeUsernameInput(username);
  const isAddressSend = recipientType === 'SUI_ADDRESS';

  const hasValidRecipient = isAddressSend
    ? isValidSuiAddressInput(username)
    : Boolean(normalizedUsername);

  const hasValidAmount =
    amount !== '' &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    isValidAmountInput(amount, coinType);
  const disabled =
    !embeddedWalletAddress ||
    !hasValidRecipient ||
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
    if (!embeddedWalletAddress || !hasValidRecipient || inFlightRef.current) return;

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

    if (availableBalance != null && BigInt(availableBalance) < baseAmount) {
      const displayBalance = formatAmount(availableBalance, coinType);
      onError(`Insufficient ${getCoinLabel(coinType)} balance. Available: ${displayBalance}`);
      return;
    }

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
      const quoteBody = isAddressSend
        ? {
            recipientAddress: username,
            coinType,
            amount: baseAmount.toString(),
            senderAddress,
          }
        : {
            username: normalizedUsername,
            coinType,
            amount: baseAmount.toString(),
            senderAddress,
          };

      const quoteRes = await privyAuthenticatedFetch(getAccessToken, '/api/v1/payments/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteBody),
        signal: controller.signal,
      }, {
        identityToken,
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
      const quote = parseQuoteResponse(quotePayload, recipientType ?? 'X_HANDLE');
      if (!quote) {
        onError('Invalid quote response');
        return;
      }

      const quoteToken = quote.quoteToken;
      let displayUsername: string;

      if (quote.recipientType === 'SUI_ADDRESS') {
        const confirmed = await requestRecipientConfirmation({
          amount,
          coinType,
          recipientType: 'SUI_ADDRESS',
          recipientAddress: quote.recipientAddress,
        });
        if (isAborted()) return;
        if (!confirmed) return;
        displayUsername = truncateAddress(quote.recipientAddress);
      } else {
        const { quoteToken: _, ...resolvedRecipient } = quote as XHandleQuoteResponse;
        const confirmed = await requestRecipientConfirmation({
          amount,
          coinType,
          recipientType: 'X_HANDLE',
          recipient: resolvedRecipient,
        });
        if (isAborted()) return;
        if (!confirmed) return;
        displayUsername = resolvedRecipient.username;
      }

      // 2. Server builds, signs, and executes the transaction
      setSendStage('confirming');

      const requestSend = (authorizationSignature?: string) => (
        privyAuthenticatedFetch(getAccessToken, '/api/v1/payments/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteToken,
            ...(authorizationSignature ? { authorizationSignature } : {}),
          }),
          signal: controller.signal,
        }, {
          identityToken,
        })
      );

      let sendRes = await requestSend();

      if (isAborted()) return;

      if (!sendRes.ok) {
        const error = await getResponseError(sendRes, 'Send failed');
        if (isAborted()) return;
        onError(error);
        return;
      }

      let sendPayload = await sendRes.json().catch(() => null);
      if (isAborted()) return;

      const authorizationRequired = parsePrivyAuthorizationRequiredResponse(sendPayload);
      if (authorizationRequired) {
        setSendStage('authorizing');

        let authorizationSignature: string;
        try {
          const result = await generateAuthorizationSignature(
            authorizationRequired.authorizationRequest,
          );
          authorizationSignature = result.signature;
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : 'Payment authorization failed';
          onError(message);
          return;
        }

        if (isAborted()) return;

        setSendStage('confirming');
        sendRes = await requestSend(authorizationSignature);

        if (isAborted()) return;

        if (!sendRes.ok) {
          const error = await getResponseError(sendRes, 'Send failed');
          if (isAborted()) return;
          onError(error);
          return;
        }

        sendPayload = await sendRes.json().catch(() => null);
        if (isAborted()) return;
      }

      if (parsePrivyAuthorizationRequiredResponse(sendPayload)) {
        onError('Payment authorization did not complete. Please try again.');
        return;
      }

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
        username: displayUsername,
        txDigest: sendResult.txDigest,
        recipientType: recipientType ?? 'X_HANDLE',
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
    buttonLabel = isAddressSend ? 'Validating address' : 'Resolving recipient';
  } else if (sendStage === 'reviewing') {
    buttonLabel = 'Review recipient';
  } else if (sendStage === 'authorizing') {
    buttonLabel = 'Authorizing payment';
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
