'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthorizationSignature, usePrivy } from '@privy-io/react-auth';
import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parsePrivyAuthorizationRequiredResponse } from '@/lib/privy-authorization';
import {
  formatPendingBalances,
  type IncomingPaymentsResponse,
} from '@/lib/received-dashboard-client';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';

type ClaimState = 'idle' | 'claiming' | 'claimed' | 'error';

interface ClaimCardProps {
  /** Pre-fetched received data; if provided, skip internal fetch */
  receivedData?: IncomingPaymentsResponse | null;
  /** Called when pending status changes (true = has claimable funds) */
  onPendingChange?: (hasPending: boolean) => void;
}

export function ClaimCard({ receivedData, onPendingChange }: ClaimCardProps) {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const [data, setData] = useState<IncomingPaymentsResponse | null>(receivedData ?? null);
  const [loading, setLoading] = useState(false);
  const [claimState, setClaimState] = useState<ClaimState>('idle');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const fetchRef = useRef<AbortController | null>(null);
  const claimRef = useRef(false);

  const twitterSubject = user?.twitter?.subject;
  const isReady = ready && authenticated && Boolean(twitterSubject);

  // Auto-fetch received data if not provided
  useEffect(() => {
    if (receivedData !== undefined) {
      setData(receivedData);
      return;
    }

    if (!isReady) {
      setData(null);
      return;
    }

    fetchRef.current?.abort();
    const controller = new AbortController();
    fetchRef.current = controller;
    setLoading(true);

    privyAuthenticatedFetch(getAccessToken, '/api/v1/payments/received', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload as IncomingPaymentsResponse);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isReady, getAccessToken, receivedData]);

  const handleClaim = useCallback(async () => {
    if (claimRef.current) return;
    claimRef.current = true;
    setClaimState('claiming');
    setClaimError(null);

    try {
      const requestClaim = (authorizationSignature?: string) =>
        privyAuthenticatedFetch(getAccessToken, '/api/v1/payments/claim', {
          method: 'POST',
          ...(authorizationSignature
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authorizationSignature }),
              }
            : {}),
        });

      let res = await requestClaim();

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'Claim failed' }));
        throw new Error(payload.error ?? 'Claim failed');
      }

      let payload = await res.json().catch(() => null);
      const authRequired = parsePrivyAuthorizationRequiredResponse(payload);

      if (authRequired) {
        const { signature } = await generateAuthorizationSignature(
          authRequired.authorizationRequest,
        );

        res = await requestClaim(signature);

        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({ error: 'Claim failed' }));
          throw new Error(errorPayload.error ?? 'Claim failed');
        }

        payload = await res.json().catch(() => null);

        if (parsePrivyAuthorizationRequiredResponse(payload)) {
          throw new Error('Authorization did not complete.');
        }
      }

      const result = (payload ?? {}) as { txDigest?: string };
      setTxDigest(result.txDigest ?? null);
      setClaimState('claimed');
      setData((prev) =>
        prev ? { ...prev, claimStatus: 'CLAIMED', pendingBalances: [] } : prev,
      );
    } catch (err) {
      setClaimState('error');
      setClaimError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      claimRef.current = false;
    }
  }, [getAccessToken, generateAuthorizationSignature]);

  const hasPending =
    !loading &&
    isReady &&
    data !== null &&
    data.claimStatus !== 'CLAIMED' &&
    data.claimStatus !== 'PREVIOUSLY_CLAIMED' &&
    data.pendingBalances.length > 0;

  useEffect(() => {
    onPendingChange?.(hasPending);
  }, [hasPending, onPendingChange]);

  // Don't render if not ready, loading, or no pending balance
  if (!isReady || loading) return null;

  if (claimState === 'claimed') {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/8 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Check className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Claim complete</p>
            <p className="text-xs text-muted-foreground">
              Funds moved to your wallet.
              {txDigest ? ` Tx: ${txDigest.slice(0, 10)}...` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPending) return null;

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4 dark:border-accent/15 dark:bg-accent/8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent dark:bg-accent/20">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {formatPendingBalances(data.pendingBalances)} pending
          </p>
          <p className="text-xs text-muted-foreground">
            Funds waiting in your vault
          </p>
        </div>
        <Button
          size="sm"
          className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={claimState === 'claiming'}
          onClick={handleClaim}
        >
          {claimState === 'claiming' ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" />
              Claiming
            </>
          ) : (
            'Claim now'
          )}
        </Button>
      </div>
      {claimState === 'error' && claimError ? (
        <p className="mt-2 text-xs text-destructive">{claimError}</p>
      ) : null}
    </div>
  );
}
