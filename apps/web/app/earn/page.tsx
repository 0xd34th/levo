'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, LoaderCircle } from 'lucide-react';
import {
  useAuthorizationSignature,
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { Button } from '@/components/ui/button';
import {
  Input,
  largeFormInputInlineGapClass,
  largeFormInputInlineInsetClass,
  largeFormInputSurfaceClass,
} from '@/components/ui/input';
import { emitAccountDataRefresh, subscribeAccountDataRefresh } from '@/lib/account-refresh';
import {
  MAINNET_USDC_TYPE,
  formatAmount,
  getExplorerTransactionUrl,
  getUserFacingUsdcCoinType,
  isValidAmountInput,
} from '@/lib/coins';
import {
  getEarnActionAvailability,
  parseAmountInputToBaseUnits,
} from '@/lib/earn-form';
import { formatEarnEstimateAmount } from '@/lib/earn-display';
import { getEarnPreviewNotice } from '@/lib/earn-preview-notice';
import {
  type PrivyAuthorizationRequest,
  parsePrivyAuthorizationRequiredResponse,
} from '@/lib/privy-authorization';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { cn } from '@/lib/utils';

type EarnAction = 'stake' | 'claim' | 'withdraw';

interface EarnSummaryResponse {
  walletReady: boolean;
  availableUsdc: string;
  depositedUsdc: string;
  claimableYieldUsdc: string;
  claimableYieldReliable: boolean;
  yieldSettlementMode: 'server_payout' | 'disabled';
  claimAllowed: boolean;
  claimMinimumYieldUsdc: string;
  claimBlockedReason: 'below_minimum_net_yield' | null;
}

interface EarnPreviewResponse extends EarnSummaryResponse {
  previewToken: string;
  action: EarnAction;
  amount: string;
  principalReceivesUsdc: string;
  yieldReceivesUsdc: string;
  userReceivesUsdc: string;
  yieldSettlementSkipped?: boolean;
}

type ExecuteEarnResponse =
  | {
      status: 'authorization_required';
      authorizationRequest: PrivyAuthorizationRequest;
    }
  | {
      status: 'confirmed' | 'pending' | 'partial';
      action: EarnAction;
      txDigest: string;
      message?: string;
    };

interface EarnFinalResponse {
  status: 'confirmed' | 'pending' | 'partial';
  txDigest: string;
  message?: string;
}

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const USER_FACING_USDC_TYPE = getUserFacingUsdcCoinType() ?? MAINNET_USDC_TYPE;

function isEarnPreviewResponse(payload: unknown): payload is EarnPreviewResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<EarnPreviewResponse>;
  return (
    typeof candidate.previewToken === 'string' &&
    (candidate.action === 'stake' || candidate.action === 'claim' || candidate.action === 'withdraw') &&
    typeof candidate.amount === 'string' &&
    typeof candidate.principalReceivesUsdc === 'string' &&
    typeof candidate.yieldReceivesUsdc === 'string' &&
    typeof candidate.userReceivesUsdc === 'string' &&
    typeof candidate.availableUsdc === 'string' &&
    typeof candidate.depositedUsdc === 'string' &&
    typeof candidate.claimableYieldUsdc === 'string' &&
    typeof candidate.claimableYieldReliable === 'boolean' &&
    typeof candidate.claimAllowed === 'boolean' &&
    typeof candidate.claimMinimumYieldUsdc === 'string' &&
    (candidate.claimBlockedReason === null || candidate.claimBlockedReason === 'below_minimum_net_yield') &&
    (candidate.yieldSettlementMode === 'server_payout' || candidate.yieldSettlementMode === 'disabled') &&
    typeof candidate.walletReady === 'boolean'
  );
}

function isEarnSummaryResponse(payload: unknown): payload is EarnSummaryResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<EarnSummaryResponse>;
  return (
    typeof candidate.walletReady === 'boolean' &&
    typeof candidate.availableUsdc === 'string' &&
    typeof candidate.depositedUsdc === 'string' &&
    typeof candidate.claimableYieldUsdc === 'string' &&
    typeof candidate.claimableYieldReliable === 'boolean' &&
    typeof candidate.claimAllowed === 'boolean' &&
    typeof candidate.claimMinimumYieldUsdc === 'string' &&
    (candidate.claimBlockedReason === null || candidate.claimBlockedReason === 'below_minimum_net_yield') &&
    (candidate.yieldSettlementMode === 'server_payout' || candidate.yieldSettlementMode === 'disabled')
  );
}

function isExecuteEarnResponse(payload: unknown): payload is ExecuteEarnResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<ExecuteEarnResponse>;
  if (candidate.status === 'authorization_required') {
    return Boolean(parsePrivyAuthorizationRequiredResponse(payload));
  }
  return (
    (candidate.status === 'confirmed' || candidate.status === 'pending' || candidate.status === 'partial') &&
    typeof candidate.txDigest === 'string' &&
    (candidate.action === 'stake' || candidate.action === 'claim' || candidate.action === 'withdraw')
  );
}

function isEarnFinalResponse(payload: unknown): payload is EarnFinalResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<EarnFinalResponse>;
  return (
    (candidate.status === 'confirmed' || candidate.status === 'pending' || candidate.status === 'partial') &&
    typeof candidate.txDigest === 'string'
  );
}

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
    // Ignore malformed error payloads.
  }
  return fallback;
}

function waitForRetryDelay(delayMs: number, signal?: AbortSignal) {
  if (!signal) {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }
  if (signal.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener('abort', handleAbort);
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

async function confirmEarnWithRetry(
  txDigest: string,
  getAccessToken: ReturnType<typeof usePrivy>['getAccessToken'],
  identityToken: string | null | undefined,
  signal?: AbortSignal,
): Promise<EarnFinalResponse | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await privyAuthenticatedFetch(
      getAccessToken,
      '/api/v1/earn/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txDigest }),
        signal,
      },
      { identityToken },
    );

    if (res.status === 202) {
      await waitForRetryDelay(2000, signal);
      continue;
    }
    if (!res.ok) {
      throw new Error(await getResponseError(res, 'Earn transaction is still pending. Please check Activity shortly.'));
    }
    const payload = await res.json();
    if (!isEarnFinalResponse(payload)) {
      throw new Error('Invalid Earn confirmation response');
    }
    return payload;
  }
  return null;
}

function actionLabel(action: EarnAction) {
  if (action === 'stake') return 'Add funds';
  if (action === 'claim') return 'Claim yield';
  return 'Withdraw';
}

export default function EarnPage() {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { generateAuthorizationSignature } = useAuthorizationSignature();

  const [summary, setSummary] = useState<EarnSummaryResponse | null>(null);
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<EarnPreviewResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingAction, setLoadingAction] = useState<EarnAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshSummary = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingSummary(true);

    try {
      const response = await privyAuthenticatedFetch(
        getAccessToken,
        '/api/v1/earn/summary',
        { cache: 'no-store', signal: controller.signal },
        { identityToken },
      );

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to load Earn summary'));
      }

      const payload = await response.json();
      if (!isEarnSummaryResponse(payload)) {
        throw new Error('Invalid Earn summary response');
      }

      setSummary(payload);
      setError(null);
    } catch (summaryError) {
      if (controller.signal.aborted) return;
      setSummary(null);
      setError(summaryError instanceof Error ? summaryError.message : 'Failed to load Earn summary');
    } finally {
      if (!controller.signal.aborted) setLoadingSummary(false);
    }
  }, [getAccessToken, identityToken]);

  useEffect(() => {
    void refreshSummary();
    return () => abortRef.current?.abort();
  }, [refreshSummary]);

  useEffect(() => {
    return subscribeAccountDataRefresh(() => {
      void refreshSummary();
    });
  }, [refreshSummary]);

  const metricSummary = useMemo(() => {
    if (!summary) {
      return { availableUsdc: '0', depositedUsdc: '0', claimableYieldUsdc: '0' };
    }
    return {
      availableUsdc: formatAmount(summary.availableUsdc, USER_FACING_USDC_TYPE),
      depositedUsdc: formatAmount(summary.depositedUsdc, USER_FACING_USDC_TYPE),
      claimableYieldUsdc: formatEarnEstimateAmount(summary.claimableYieldUsdc, USER_FACING_USDC_TYPE),
    };
  }, [summary]);

  const parsedAmountBaseUnits = useMemo(
    () => parseAmountInputToBaseUnits(amount, USER_FACING_USDC_TYPE),
    [amount],
  );

  const actionAvailability = useMemo(
    () =>
      getEarnActionAvailability({
        amountInput: amount,
        busy: executing || loadingAction !== null,
        coinType: USER_FACING_USDC_TYPE,
        summary,
      }),
    [amount, executing, loadingAction, summary],
  );

  const previewNotice = preview ? getEarnPreviewNotice(preview) : null;
  const claimThresholdNotice =
    summary?.claimBlockedReason === 'below_minimum_net_yield'
      ? `Claim available once yield reaches ${formatAmount(
          summary.claimMinimumYieldUsdc,
          USER_FACING_USDC_TYPE,
        )} USDC. Small claims cost more gas than they are worth.`
      : null;

  const requestPreview = useCallback(async (action: EarnAction) => {
    if (action !== 'claim' && !amount) {
      setError('Enter an amount first');
      return;
    }
    if (action !== 'claim' && !isValidAmountInput(amount, USER_FACING_USDC_TYPE)) {
      setError('Amount must be a valid USDC value');
      return;
    }
    if (action !== 'claim' && parsedAmountBaseUnits === null) {
      setError('Amount must be greater than zero');
      return;
    }
    if (action === 'stake' && summary && parsedAmountBaseUnits !== null && parsedAmountBaseUnits > BigInt(summary.availableUsdc)) {
      setError('Amount exceeds available USDC');
      return;
    }
    if (action === 'withdraw' && summary && parsedAmountBaseUnits !== null && parsedAmountBaseUnits > BigInt(summary.depositedUsdc)) {
      setError('Amount exceeds deposited USDC');
      return;
    }

    setError(null);
    setNotice(null);
    setTxDigest(null);
    setLoadingAction(action);

    try {
      const baseUnits = action === 'claim' ? undefined : parsedAmountBaseUnits?.toString();

      const response = await privyAuthenticatedFetch(
        getAccessToken,
        '/api/v1/earn/preview',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ...(baseUnits !== undefined ? { amount: baseUnits } : {}),
          }),
        },
        { identityToken },
      );

      if (!response.ok) {
        throw new Error(await getResponseError(response, 'Failed to preview Earn action'));
      }
      const payload = await response.json();
      if (!isEarnPreviewResponse(payload)) {
        throw new Error('Invalid Earn preview response');
      }
      setPreview(payload);
      setError(null);
    } catch (previewError) {
      setPreview(null);
      setError(previewError instanceof Error ? previewError.message : 'Failed to preview Earn action');
    } finally {
      setLoadingAction(null);
    }
  }, [amount, getAccessToken, identityToken, parsedAmountBaseUnits, summary]);

  const executePreview = useCallback(async () => {
    if (!preview) return;

    setExecuting(true);
    setError(null);
    setNotice(null);

    try {
      const requestExecute = (authorizationSignature?: string) => (
        privyAuthenticatedFetch(
          getAccessToken,
          '/api/v1/earn/execute',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              previewToken: preview.previewToken,
              ...(authorizationSignature ? { authorizationSignature } : {}),
            }),
          },
          { identityToken },
        )
      );

      let executeResponse = await requestExecute();
      if (!executeResponse.ok) {
        throw new Error(await getResponseError(executeResponse, 'Earn execution failed'));
      }

      let payload = await executeResponse.json();
      const authorizationRequired = parsePrivyAuthorizationRequiredResponse(payload);
      if (authorizationRequired) {
        const signatureResult = await generateAuthorizationSignature(
          authorizationRequired.authorizationRequest,
        );
        executeResponse = await requestExecute(signatureResult.signature);
        if (!executeResponse.ok) {
          throw new Error(await getResponseError(executeResponse, 'Earn execution failed'));
        }
        payload = await executeResponse.json();
      }

      if (!isExecuteEarnResponse(payload)) {
        throw new Error('Invalid Earn execution response');
      }

      if (payload.status === 'authorization_required') {
        throw new Error('Earn authorization did not complete. Please try again.');
      }

      if (payload.status === 'pending') {
        const confirmed = await confirmEarnWithRetry(
          payload.txDigest,
          getAccessToken,
          identityToken,
        );
        if (!confirmed) {
          throw new Error('Earn transaction is still pending. Please check Activity shortly.');
        }
        payload = {
          ...payload,
          status: confirmed.status,
          txDigest: confirmed.txDigest,
          ...(confirmed.message ? { message: confirmed.message } : {}),
        };
      }

      if (payload.status === 'partial') {
        setNotice(payload.message ?? 'Yield was settled, but principal withdraw is still pending.');
      }

      setTxDigest(payload.txDigest);
      setPreview(null);
      setAmount('');
      setError(null);
      emitAccountDataRefresh();
      await refreshSummary();
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'Earn execution failed');
    } finally {
      setExecuting(false);
    }
  }, [generateAuthorizationSignature, getAccessToken, identityToken, preview, refreshSummary]);

  const yieldServerPayout = summary?.yieldSettlementMode === 'server_payout';
  const claimableValue = metricSummary.claimableYieldUsdc;

  return (
    <div className="min-h-screen bg-background">
      <MobileTopBar title="Earn" backHref="/" />

      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-3">
        <div className="flex flex-col gap-3">
          {/* Hero card */}
          <section className="rounded-[20px] bg-surface px-5 py-5">
            <p className="eyebrow">Claimable yield</p>
            <div
              className="mt-4 flex items-baseline gap-0 tabular-nums"
              style={{
                fontFamily: 'var(--font-sans)',
                color: 'var(--up)',
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 500, marginRight: 2 }}>+$</span>
              <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1 }}>
                {loadingSummary ? '…' : claimableValue}
              </span>
            </div>
            <p className="mt-3 text-[13px]" style={{ color: 'var(--text-mute)' }}>
              {yieldServerPayout
                ? 'Accruing in real time · server-settled payout'
                : 'Yield settlement currently disabled · balances shown are estimates'}
            </p>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[18px] bg-surface px-4 py-4">
              <p className="eyebrow">Available USDC</p>
              <p
                className="mt-2 tabular-nums text-[26px] font-semibold tracking-[-0.02em]"
              >
                ${loadingSummary ? '…' : metricSummary.availableUsdc}
              </p>
            </div>
            <div className="rounded-[18px] bg-surface px-4 py-4">
              <p className="eyebrow">Earning balance</p>
              <p
                className="mt-2 tabular-nums text-[26px] font-semibold tracking-[-0.02em]"
              >
                ${loadingSummary ? '…' : metricSummary.depositedUsdc}
              </p>
            </div>
          </section>

          {/* Amount input (v3 inline) */}
          <section className="rounded-[20px] bg-surface px-4 py-4">
            <p className="eyebrow">Amount</p>
            <div
              className={cn(
                'mt-2.5 flex items-center rounded-[14px] bg-background py-3',
                largeFormInputSurfaceClass,
                largeFormInputInlineInsetClass,
                largeFormInputInlineGapClass,
              )}
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text-mute)' }}>
                USDC
              </span>
              <Input
                className="h-auto border-0 bg-transparent px-0 text-[20px] font-semibold tabular-nums shadow-none focus-visible:ring-0"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => {
                  const val = event.target.value;
                  if (val === '' || isValidAmountInput(val, USER_FACING_USDC_TYPE)) {
                    setAmount(val);
                  }
                }}
              />
            </div>
            <p className="mt-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
              Add funds and withdraw use USDC input. Claim doesn&rsquo;t need an amount.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-[14px] bg-background hover:bg-raise"
                disabled={!actionAvailability.withdraw}
                onClick={() => void requestPreview('withdraw')}
              >
                {loadingAction === 'withdraw' ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" />
                    Preparing
                  </span>
                ) : (
                  'Withdraw'
                )}
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-[14px] bg-background hover:bg-raise"
                disabled={!actionAvailability.claim}
                onClick={() => void requestPreview('claim')}
              >
                {loadingAction === 'claim' ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" />
                    Preparing
                  </span>
                ) : (
                  'Claim'
                )}
              </Button>
              <Button
                className="h-11 rounded-[14px]"
                disabled={!actionAvailability.stake}
                onClick={() => void requestPreview('stake')}
              >
                {loadingAction === 'stake' ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" />
                    Preparing
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    Add funds
                    <ArrowUp className="size-4" />
                  </span>
                )}
              </Button>
            </div>
            {claimThresholdNotice ? (
              <p className="mt-3 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                {claimThresholdNotice}
              </p>
            ) : null}
          </section>

          {/* How it works */}
          <section className="rounded-[18px] bg-surface px-4 py-4">
            <p className="text-[15px] font-semibold">How your yield works</p>
            <div className="mt-2.5">
              {[
                { t: 'Idle USDC is lent on Sui', d: 'Through StableLayer yield vaults.' },
                { t: 'Interest accrues per second', d: 'Paid out to your wallet when you claim.' },
                { t: 'Withdraw any time', d: 'No lock-up, no minimum.' },
              ].map((r, i) => (
                <div
                  key={r.t}
                  className={cn(
                    'flex gap-3 py-2.5',
                    i !== 0 ? 'border-t border-[color:var(--border)]' : null,
                  )}
                >
                  <div
                    className="flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{
                      background: 'var(--up-soft)',
                      color: 'var(--up)',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-[14.5px] font-medium">{r.t}</div>
                    <div className="mt-0.5 text-[13px]" style={{ color: 'var(--text-mute)' }}>
                      {r.d}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error ? (
            <div
              className="rounded-[16px] px-4 py-3 text-[13px]"
              style={{ background: 'var(--down-soft)', color: 'var(--down)' }}
            >
              {error}
            </div>
          ) : null}

          {notice ? (
            <div
              className="rounded-[16px] px-4 py-3 text-[13px]"
              style={{ background: 'var(--up-soft)', color: 'var(--up)' }}
            >
              {notice}
            </div>
          ) : null}

          {preview ? (
            <section className="rounded-[20px] bg-surface px-5 py-5">
              <p className="eyebrow">Review action</p>
              <p className="mt-2 text-[19px] font-semibold tracking-[-0.005em]">
                {actionLabel(preview.action)}
              </p>
              <div className="mt-3 space-y-2 text-[14px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-mute)' }}>Input</span>
                  <span className="mono-nums font-medium">
                    {preview.action === 'claim'
                      ? 'No amount'
                      : `${formatAmount(preview.amount, USER_FACING_USDC_TYPE)} USDC`}
                  </span>
                </div>
                {preview.action === 'withdraw' ? (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-mute)' }}>Principal returns</span>
                    <span className="mono-nums font-medium">
                      {formatAmount(preview.principalReceivesUsdc, USER_FACING_USDC_TYPE)} USDC
                    </span>
                  </div>
                ) : null}
                {preview.action !== 'stake' ? (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--text-mute)' }}>Yield settles</span>
                    <span className="mono-nums font-medium" style={{ color: 'var(--up)' }}>
                      +{formatEarnEstimateAmount(preview.yieldReceivesUsdc, USER_FACING_USDC_TYPE)} USDC
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-mute)' }}>You receive</span>
                  <span className="mono-nums font-semibold">
                    {formatEarnEstimateAmount(preview.userReceivesUsdc, USER_FACING_USDC_TYPE)} USDC
                  </span>
                </div>
              </div>

              {previewNotice ? (
                <div
                  className="mt-3 rounded-[12px] px-3 py-2 text-[12px]"
                  style={
                    previewNotice.tone === 'warning'
                      ? { background: 'rgba(245, 158, 11, 0.12)', color: '#92400e' }
                      : { background: 'var(--raise)', color: 'var(--text-mute)' }
                  }
                >
                  {previewNotice.message}
                </div>
              ) : null}

              <div className="mt-4 flex gap-2.5">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-[14px] bg-background hover:bg-raise"
                  disabled={executing}
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="h-12 flex-1 rounded-[14px]"
                  disabled={executing}
                  onClick={() => void executePreview()}
                >
                  {executing ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" />
                      Processing
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      Continue
                      <ArrowRight className="size-4" />
                    </span>
                  )}
                </Button>
              </div>
            </section>
          ) : null}

          {txDigest ? (
            <section className="rounded-[20px] bg-surface px-5 py-5">
              <p className="eyebrow">Latest transaction</p>
              <p className="mt-2 break-all font-mono text-[12px]">{txDigest}</p>
              {getExplorerTransactionUrl(NETWORK, txDigest) ? (
                <a
                  className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium"
                  href={getExplorerTransactionUrl(NETWORK, txDigest)!}
                  rel="noreferrer"
                  target="_blank"
                >
                  View on explorer
                  <ArrowRight className="size-3.5" />
                </a>
              ) : null}
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
