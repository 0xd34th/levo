'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface EmbeddedWalletState {
  suiAddress: string | null;
  loading: boolean;
  error: string | null;
}

interface InternalEmbeddedWalletState extends EmbeddedWalletState {
  identityKey: string | null;
}

const embeddedWalletAddressCache = new Map<string, string>();

/**
 * Hook that auto-provisions a Privy embedded Sui wallet after X login.
 * Calls POST /api/v1/wallet/setup and caches the result.
 */
export function useEmbeddedWallet(): EmbeddedWalletState & { refetch: () => void } {
  const { ready, authenticated, user } = usePrivy();
  const [state, setState] = useState<InternalEmbeddedWalletState>({
    identityKey: null,
    suiAddress: null,
    loading: false,
    error: null,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const fetchedRef = useRef(false);
  const authIdentityRef = useRef<string | null>(null);
  const authIdentityKey = authenticated
    ? user?.twitter?.subject ?? user?.id ?? '__authenticated__'
    : null;

  const setupWallet = useCallback(async () => {
    if (!authIdentityKey) {
      setState({
        identityKey: null,
        suiAddress: null,
        loading: false,
        error: null,
      });
      return;
    }

    const cachedAddress = embeddedWalletAddressCache.get(authIdentityKey);
    if (cachedAddress) {
      fetchedRef.current = true;
      setState({
        identityKey: authIdentityKey,
        suiAddress: cachedAddress,
        loading: false,
        error: null,
      });
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({
      identityKey: authIdentityKey,
      suiAddress: null,
      loading: true,
      error: null,
    });

    try {
      const res = await fetch('/api/v1/wallet/setup', {
        method: 'POST',
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'Wallet setup failed' }));
        setState({
          identityKey: authIdentityKey,
          suiAddress: null,
          loading: false,
          error: payload.error ?? 'Wallet setup failed',
        });
        return;
      }

      const payload = await res.json();
      if (controller.signal.aborted) return;

      if (payload.suiAddress) {
        embeddedWalletAddressCache.set(authIdentityKey, payload.suiAddress);
      }
      setState({
        identityKey: authIdentityKey,
        suiAddress: payload.suiAddress ?? null,
        loading: false,
        error: null,
      });
      fetchedRef.current = true;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setState({
        identityKey: authIdentityKey,
        suiAddress: null,
        loading: false,
        error: 'Failed to set up wallet',
      });
    }
  }, [authIdentityKey]);

  useEffect(() => {
    let cancelled = false;

    if (ready && !authenticated) {
      const previousIdentityKey = authIdentityRef.current;
      if (previousIdentityKey) {
        embeddedWalletAddressCache.delete(previousIdentityKey);
      }
      authIdentityRef.current = null;
      fetchedRef.current = false;
    } else if (ready && authIdentityRef.current !== authIdentityKey) {
      authIdentityRef.current = authIdentityKey;
      fetchedRef.current = Boolean(
        authIdentityKey && embeddedWalletAddressCache.has(authIdentityKey),
      );
    }

    if (ready && authenticated && !fetchedRef.current) {
      queueMicrotask(() => {
        if (cancelled || fetchedRef.current) {
          return;
        }

        void setupWallet();
      });
    }

    return () => {
      cancelled = true;
      controllerRef.current?.abort();
    };
  }, [ready, authenticated, authIdentityKey, setupWallet]);

  const refetch = useCallback(() => {
    fetchedRef.current = false;
    if (authIdentityKey) {
      embeddedWalletAddressCache.delete(authIdentityKey);
    }
    void setupWallet();
  }, [authIdentityKey, setupWallet]);

  const cachedSuiAddress =
    authIdentityKey ? embeddedWalletAddressCache.get(authIdentityKey) ?? null : null;

  const effectiveState: EmbeddedWalletState =
    ready && !authenticated
      ? { suiAddress: null, loading: false, error: null }
      : cachedSuiAddress
        ? { suiAddress: cachedSuiAddress, loading: false, error: null }
        : state.identityKey !== authIdentityKey
          ? { suiAddress: null, loading: true, error: null }
          : state;

  return { ...effectiveState, refetch };
}
