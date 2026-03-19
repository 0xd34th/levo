'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  useAuthorizationSignature,
  useLoginWithOAuth,
  usePrivy,
} from '@privy-io/react-auth';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { ClaimStepper, type ClaimStep } from '@/components/claim-stepper';
import { Navbar } from '@/components/navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { parsePrivyAuthorizationRequiredResponse } from '@/lib/privy-authorization';
import {
  claimStatusLabel,
  formatPendingBalances,
  normalizeHandle,
  truncateAddress,
  type PublicLookupResponse,
} from '@/lib/received-dashboard-client';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { MAX_X_HANDLE_LENGTH } from '@/lib/send-form';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

type ClaimOutcome = { type: 'claimed'; txDigest: string };

export default function ClaimPage() {
  const {
    suiAddress: embeddedWalletAddress,
    loading: walletLoading,
    error: embeddedWalletError,
    refetch: refetchEmbeddedWallet,
  } = useEmbeddedWallet();
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
    getAccessToken,
  } = usePrivy();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const { initOAuth } = useLoginWithOAuth();
  const [handle, setHandle] = useState('');
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [loadingStepId, setLoadingStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [claimOutcome, setClaimOutcome] = useState<ClaimOutcome | null>(null);
  const [lookup, setLookup] = useState<PublicLookupResponse | null>(null);
  const lookupRequestIdRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const stepDelayAbortRef = useRef<AbortController | null>(null);
  const stepActionRequestIdRef = useRef(0);
  const claimInFlightRef = useRef(false);

  const walletReady = Boolean(embeddedWalletAddress);
  const previouslyClaimed =
    lookup !== null && lookup.claimStatus === 'PREVIOUSLY_CLAIMED';
  const effectiveClaimed =
    claimOutcome?.type === 'claimed' ||
    (lookup !== null && lookup.claimStatus === 'CLAIMED');
  const privyTwitter = privyUser?.twitter;
  const privyXLinked = privyReady && privyAuthenticated && Boolean(privyTwitter);
  const effectiveSignedIn =
    Boolean(lookup?.xUserId) && privyTwitter?.subject === lookup?.xUserId;
  const signedInHandleMismatch =
    privyXLinked && Boolean(lookup?.xUserId) && !effectiveSignedIn;

  useEffect(() => {
    if (!effectiveSignedIn) {
      stepDelayAbortRef.current?.abort();
      stepDelayAbortRef.current = null;
      stepActionRequestIdRef.current += 1;
      setLoadingStepId(null);
      setClaimOutcome(null);
    }
  }, [effectiveSignedIn]);

  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort();
      stepDelayAbortRef.current?.abort();
    };
  }, []);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const username = normalizeHandle(handle);
    const lookupRequestId = lookupRequestIdRef.current + 1;
    lookupRequestIdRef.current = lookupRequestId;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    stepDelayAbortRef.current?.abort();
    stepDelayAbortRef.current = null;
    stepActionRequestIdRef.current += 1;
    setLookup(null);
    setClaimOutcome(null);
    setLoadingStepId(null);
    setNotice(null);

    if (!username) {
      setLoadingLookup(false);
      setError('Enter the X handle that should claim funds.');
      return;
    }

    setLoadingLookup(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    try {
      const params = new URLSearchParams({ username });
      const response = await fetch(`/api/v1/lookup/x-username?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (lookupRequestIdRef.current !== lookupRequestId) return;

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Unable to load claim details' }));
        throw new Error(payload.error ?? 'Unable to load claim details');
      }

      const payload = (await response.json()) as PublicLookupResponse;
      if (lookupRequestIdRef.current !== lookupRequestId) return;

      setLookup(payload);
      setClaimOutcome(null);
    } catch (lookupError) {
      if (controller.signal.aborted) return;
      if (lookupRequestIdRef.current !== lookupRequestId) return;
      setLookup(null);
      setError(lookupError instanceof Error ? lookupError.message : 'Unable to load claim details');
    } finally {
      if (lookupAbortRef.current === controller) {
        lookupAbortRef.current = null;
      }
      if (lookupRequestIdRef.current === lookupRequestId) {
        setLoadingLookup(false);
      }
    }
  }

  const steps: ClaimStep[] = [
    {
      id: 'signin',
      title: 'Sign in with X',
      description: 'Verify ownership of the handle before connecting a wallet.',
      actionLabel: effectiveSignedIn
        ? 'Signed in'
        : signedInHandleMismatch
          ? 'Use matching X'
          : 'Sign in with X',
      status: effectiveSignedIn ? 'complete' : 'current',
    },
    {
      id: 'connect',
      title: walletReady ? 'Wallet ready' : 'Wallet setup',
      description: walletReady
        ? 'Your embedded Sui wallet is ready to receive claimed funds.'
        : embeddedWalletError
          ? embeddedWalletError
          : walletLoading
            ? 'Setting up your embedded wallet.'
            : 'Sign in with X to auto-create your embedded wallet.',
      actionLabel: walletReady
        ? 'Embedded wallet'
        : embeddedWalletError
          ? 'Retry wallet'
          : walletLoading
            ? 'Setting up'
            : 'Sign in first',
      status: effectiveSignedIn
        ? walletReady
          ? 'complete'
          : 'current'
        : 'upcoming',
    },
    {
      id: 'claim',
      title: 'Claim funds',
      description: 'Finalize the transfer from the vault into your embedded wallet.',
      actionLabel: effectiveClaimed
        ? 'Claimed'
        : previouslyClaimed
          ? 'Previously claimed'
          : 'Claim now',
      status: effectiveSignedIn && walletReady
        ? effectiveClaimed
          ? 'complete'
          : 'current'
        : 'upcoming',
    },
  ];

  async function handleStepAction(id: string) {
    setNotice(null);

    if (id === 'signin') {
      if (effectiveSignedIn) return;
      if (signedInHandleMismatch) {
        setNotice(
          privyTwitter?.username
            ? `You are signed in as @${privyTwitter.username}. Sign out and continue as @${lookup?.username} to preview this claim.`
            : 'The connected X account does not match this handle. Sign out and continue with the matching account.',
        );
        return;
      }
      try {
        setLoadingStepId(id);
        await initOAuth({ provider: 'twitter' });
      } catch {
        setNotice('X sign-in was cancelled or failed. Please try again.');
      } finally {
        setLoadingStepId(null);
      }
      return;
    }

    if (id === 'connect') {
      if (!walletReady) {
        if (embeddedWalletError) {
          refetchEmbeddedWallet();
          setNotice('Retrying embedded wallet setup…');
        } else if (walletLoading) {
          setNotice('Wallet setup is still running. Please wait a moment.');
        } else {
          setNotice('Sign in with X first — your embedded wallet will be created automatically.');
        }
      }
      return;
    }

    if (id === 'claim') {
      if (claimInFlightRef.current) {
        return;
      }

      if (!effectiveSignedIn) {
        setNotice('Sign in with X before claiming.');
        return;
      }

      if (!walletReady) {
        setNotice('Wallet not ready yet. Please wait a moment.');
        return;
      }

      if (!lookup) {
        setNotice('Load the handle first so Levo can check the vault.');
        return;
      }

      if (previouslyClaimed) {
        setNotice('This vault was already claimed previously.');
        return;
      }

      if (lookup.pendingBalances.length === 0) {
        setNotice('There is no claimable balance in the vault yet.');
        return;
      }

      if (effectiveClaimed) {
        setNotice('This vault has already been claimed.');
        return;
      }

      const stepRequestId = stepActionRequestIdRef.current + 1;
      stepActionRequestIdRef.current = stepRequestId;
      stepDelayAbortRef.current?.abort();
      const controller = new AbortController();
      stepDelayAbortRef.current = controller;
      claimInFlightRef.current = true;
      setLoadingStepId(id);

      try {
        const requestClaim = (authorizationSignature?: string) => (
          privyAuthenticatedFetch(getAccessToken, '/api/v1/payments/claim', {
            method: 'POST',
            signal: controller.signal,
            ...(authorizationSignature
              ? {
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ authorizationSignature }),
                }
              : {}),
          })
        );

        let res = await requestClaim();

        if (
          controller.signal.aborted ||
          stepActionRequestIdRef.current !== stepRequestId
        ) {
          return;
        }

        if (!res.ok) {
          const payload = await res.json().catch(() => ({ error: 'Claim failed' }));
          setNotice(payload.error ?? 'Claim failed. Please try again.');
          return;
        }

        let payload = await res.json().catch(() => null);
        const authorizationRequired = parsePrivyAuthorizationRequiredResponse(payload);
        if (authorizationRequired) {
          let authorizationSignature: string;
          try {
            const result = await generateAuthorizationSignature(
              authorizationRequired.authorizationRequest,
            );
            authorizationSignature = result.signature;
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : 'Claim authorization failed';
            setNotice(message);
            return;
          }

          if (
            controller.signal.aborted ||
            stepActionRequestIdRef.current !== stepRequestId
          ) {
            return;
          }

          res = await requestClaim(authorizationSignature);

          if (
            controller.signal.aborted ||
            stepActionRequestIdRef.current !== stepRequestId
          ) {
            return;
          }

          if (!res.ok) {
            const errorPayload = await res.json().catch(() => ({ error: 'Claim failed' }));
            setNotice(errorPayload.error ?? 'Claim failed. Please try again.');
            return;
          }

          payload = await res.json().catch(() => null);
        }

        if (parsePrivyAuthorizationRequiredResponse(payload)) {
          setNotice('Claim authorization did not complete. Please try again.');
          return;
        }

        const result = (payload ?? {}) as { txDigest?: string };
        setLookup((currentLookup) => (
          currentLookup
            ? {
                ...currentLookup,
                claimStatus: 'CLAIMED',
                vaultExists: true,
                pendingBalances: [],
              }
            : currentLookup
        ));
        setClaimOutcome({
          type: 'claimed',
          txDigest: result.txDigest ?? '',
        });
        setNotice(
          result.txDigest
            ? `Claim successful! Transaction: ${result.txDigest.slice(0, 10)}...`
            : 'Claim successful!',
        );
      } catch (claimError) {
        if (claimError instanceof DOMException && claimError.name === 'AbortError') {
          return;
        }
        setNotice('Claim failed. Please try again.');
      } finally {
        claimInFlightRef.current = false;
        if (stepDelayAbortRef.current === controller) {
          stepDelayAbortRef.current = null;
        }

        if (stepActionRequestIdRef.current === stepRequestId) {
          setLoadingStepId(null);
        }
      }
    }
  }

  return (
    <div className="app-shell">
      <Navbar />

      <main className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <p className="section-eyebrow">Claim flow</p>
          <h1 className="hero-heading mt-3 max-w-2xl">You received money.</h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Sign in with X, connect a wallet, and move funds out of the deterministic vault with the least possible Web3 friction.
          </p>
        </section>

        <section className="mx-auto mt-8 w-full max-w-3xl">
          <Card className="glass-card rounded-[30px] bg-card/95 py-0 dark:bg-[#11161d]/92">
            <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
              <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleLookup}>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                    @
                  </span>
                  <Input
                    className="h-16 rounded-[22px] border-border/70 bg-background/80 pl-12 text-lg font-medium dark:border-white/10 dark:bg-white/5"
                    maxLength={MAX_X_HANDLE_LENGTH + 1}
                    placeholder="username"
                    value={handle}
                    onChange={(event) => setHandle(normalizeHandle(event.target.value))}
                  />
                </div>
                <Button className="h-16 rounded-[22px] px-5" disabled={loadingLookup} type="submit">
                  {loadingLookup ? 'Loading…' : 'Find funds'}
                  <ArrowRight className="size-4" />
                </Button>
              </form>

              {error ? (
                <div className="mt-4 rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        {lookup ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="glass-card rounded-[30px] bg-card/95 py-0 dark:bg-[#11161d]/92">
              <CardContent className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="section-eyebrow">Pending funds</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                      {formatPendingBalances(lookup.pendingBalances)}
                    </h2>
                  </div>
                  <Badge className="rounded-full bg-secondary text-secondary-foreground dark:bg-white/8 dark:text-foreground">
                    {claimStatusLabel(lookup.claimStatus)}
                  </Badge>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-secondary/60 p-4 dark:border-white/10 dark:bg-white/4">
                  <p className="text-sm font-medium">@{lookup.username}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vault: {truncateAddress(lookup.vaultAddress)}
                  </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {lookup.vaultExists
                        ? 'A claimed vault object already exists on-chain for this handle.'
                        : lookup.claimStatus === 'PREVIOUSLY_CLAIMED'
                          ? 'This vault was claimed previously and the vault object has already been consumed.'
                          : 'No vault object yet. Funds remain in the deterministic address until claim.'}
                    </p>
                  </div>

                <div className="metric-card">
                  <p className="section-eyebrow">What changes after claim</p>
                  <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                    Funds become wallet-accessible without the sender ever needing a raw address.
                  </p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="size-4 text-primary" />
                    X identity first, wallet second.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card rounded-[30px] bg-card/95 py-0 dark:bg-[#11161d]/92">
              <CardContent className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
                <div>
                  <p className="section-eyebrow">Three-step claim</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    Clear progress, minimal chain jargon
                  </h2>
                </div>

                <ClaimStepper
                  loadingStepId={loadingStepId}
                  onStepAction={handleStepAction}
                  steps={steps}
                />

                {notice ? (
                  <div className="rounded-[22px] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-foreground">
                    {notice}
                  </div>
                ) : null}

                {embeddedWalletError && !walletReady ? (
                  <div className="rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3">
                    <p className="text-sm text-destructive">{embeddedWalletError}</p>
                    <Button
                      className="mt-3 rounded-full"
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        refetchEmbeddedWallet();
                      }}
                    >
                      Retry wallet setup
                    </Button>
                  </div>
                ) : null}

                {claimOutcome?.type === 'claimed' ? (
                  <div className="rounded-[24px] border border-primary/20 bg-primary/8 p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Sparkles className="size-5" />
                      </span>
                      <div>
                        <p className="font-semibold">Claim complete</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Funds have been moved into the connected embedded wallet.
                          {claimOutcome.txDigest
                            ? ` Transaction: ${claimOutcome.txDigest.slice(0, 10)}...`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </section>
        ) : null}
      </main>
    </div>
  );
}
