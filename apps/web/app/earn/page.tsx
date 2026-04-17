'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import {
  useAuthorizationSignature,
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

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
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

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
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

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
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

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

  if (signal.aborted) {
    return Promise.reject(new DOMException('Request aborted', 'AbortError'));
  }

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
  if (action === 'stake') return 'Stake USDC';
  if (action === 'claim') return 'Claim Yield';
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
        {
          cache: 'no-store',
          signal: controller.signal,
        },
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
      if (controller.signal.aborted) {
        return;
      }

      setSummary(null);
      setError(summaryError instanceof Error ? summaryError.message : 'Failed to load Earn summary');
    } finally {
      if (!controller.signal.aborted) {
        setLoadingSummary(false);
      }
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
      return {
        availableUsdc: '0',
        depositedUsdc: '0',
        claimableYieldUsdc: '0',
      };
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
    () => getEarnActionAvailability({
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
    if (!preview) {
      return;
    }

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

  return (
    <div className="min-h-screen">
      <MobileTopBar title="Earn" backHref="/" />

      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
        <div className="flex flex-col gap-5">
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="metric-card">
              <p className="section-eyebrow">Available USDC</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                {loadingSummary ? '...' : metricSummary.availableUsdc}
              </p>
            </div>
            <div className="metric-card">
              <p className="section-eyebrow">Deposited USDC</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                {loadingSummary ? '...' : metricSummary.depositedUsdc}
              </p>
            </div>
            <div className="metric-card">
              <p className="section-eyebrow">Claimable Yield</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                {loadingSummary ? '...' : metricSummary.claimableYieldUsdc}
              </p>
            </div>
          </section>

          <div className="rounded-3xl border border-border/60 bg-card px-5 py-5 dark:border-white/10 dark:bg-white/5">
            <label className="text-sm font-medium text-foreground" htmlFor="earn-amount">
              Amount
            </label>
            <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-border/70 bg-background/80 px-5 py-3 dark:border-white/10 dark:bg-white/5">
              <span className="text-sm font-semibold text-muted-foreground">USDC</span>
              <Input
                id="earn-amount"
                className="h-auto border-0 bg-transparent px-0 text-xl shadow-none focus-visible:ring-0"
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
            <p className="mt-2 text-xs text-muted-foreground">
              Stake and withdraw use USDC input. Claim does not require an amount.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(['stake', 'claim', 'withdraw'] as EarnAction[]).map((action) => (
                <Button
                  key={action}
                  className="h-12 rounded-[18px]"
                  disabled={!actionAvailability[action]}
                  onClick={() => void requestPreview(action)}
                  variant={action === 'claim' ? 'default' : 'outline'}
                >
                  {loadingAction === action ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" />
                      Preparing
                    </span>
                  ) : (
                    actionLabel(action)
                  )}
                </Button>
              ))}
            </div>
            {claimThresholdNotice ? (
              <p className="mt-3 text-xs text-muted-foreground">{claimThresholdNotice}</p>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/6 px-4 py-3 text-sm text-primary dark:border-primary/25 dark:bg-primary/10">
              {notice}
            </div>
          ) : null}

          {preview ? (
            <div className="rounded-3xl border border-border/60 bg-card px-5 py-5 dark:border-white/10 dark:bg-white/5">
              <p className="section-eyebrow">Review action</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                {actionLabel(preview.action)}
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Input</span>
                  <span>
                    {preview.action === 'claim'
                      ? 'No amount'
                      : `${formatAmount(preview.amount, USER_FACING_USDC_TYPE)} USDC`}
                  </span>
                </div>
                {preview.action === 'withdraw' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Principal returns</span>
                    <span>{formatAmount(preview.principalReceivesUsdc, USER_FACING_USDC_TYPE)} USDC</span>
                  </div>
                ) : null}
                {preview.action !== 'stake' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Yield settles</span>
                    <span>{formatEarnEstimateAmount(preview.yieldReceivesUsdc, USER_FACING_USDC_TYPE)} USDC</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">You receive</span>
                  <span>{formatEarnEstimateAmount(preview.userReceivesUsdc, USER_FACING_USDC_TYPE)} USDC</span>
                </div>
              </div>

              {previewNotice ? (
                <div
                  className={
                    previewNotice.tone === 'warning'
                      ? 'mt-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-400'
                      : 'mt-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/4'
                  }
                >
                  {previewNotice.message}
                </div>
              ) : null}

              <div className="mt-5 flex gap-3">
                <Button
                  className="flex-1 rounded-[18px]"
                  disabled={executing}
                  variant="outline"
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-[18px]"
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
            </div>
          ) : null}

          {txDigest ? (
            <div className="rounded-3xl border border-primary/20 bg-primary/6 px-5 py-5 dark:border-primary/25 dark:bg-primary/10">
              <p className="section-eyebrow">Latest transaction</p>
              <p className="mt-3 break-all font-mono text-sm text-foreground">{txDigest}</p>
              {getExplorerTransactionUrl(NETWORK, txDigest) ? (
                <a
                  className="mt-4 inline-flex text-sm font-medium text-primary"
                  href={getExplorerTransactionUrl(NETWORK, txDigest)!}
                  rel="noreferrer"
                  target="_blank"
                >
                  View on explorer
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
