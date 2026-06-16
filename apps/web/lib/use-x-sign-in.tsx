'use client';

import { useCallback } from 'react';
import { useLoginWithOAuth } from '@privy-io/react-auth';
import { emitLoginError } from '@/lib/login-error';

// X (Twitter) is the only login method, so a silent failure leaves the whole
// app unusable with no feedback. Map known failures to actionable copy and
// surface everything else verbatim instead of swallowing it.
const RATE_LIMIT_MESSAGE =
  'Sign-in with X is being rate-limited right now. Please wait a moment and try again.';
const GENERIC_MESSAGE = "Couldn't sign in with X. Please try again.";

export function formatLoginError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'privyErrorCode' in error
      ? String((error as { privyErrorCode?: unknown }).privyErrorCode ?? '')
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  if (code === 'too_many_requests' || /rate.?limit|too.?many.?request|\b429\b/i.test(message)) {
    return RATE_LIMIT_MESSAGE;
  }

  return message ? `${GENERIC_MESSAGE} (${message})` : GENERIC_MESSAGE;
}

/**
 * Shared "Sign in with X" trigger. Wraps Privy's OAuth login and reports any
 * failure to the global login-error banner instead of dropping it.
 */
export function useXSignIn() {
  const { initOAuth, loading } = useLoginWithOAuth({
    onError: (error) => emitLoginError(formatLoginError(error)),
  });

  const signIn = useCallback(() => {
    void Promise.resolve()
      .then(() => initOAuth({ provider: 'twitter' }))
      .catch((error) => emitLoginError(formatLoginError(error)));
  }, [initOAuth]);

  return { signIn, loading: Boolean(loading) };
}
