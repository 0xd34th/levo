/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initOAuthMock } = vi.hoisted(() => ({ initOAuthMock: vi.fn() }));

vi.mock('@privy-io/react-auth', () => ({
  useLoginWithOAuth: () => ({ initOAuth: initOAuthMock, loading: false }),
}));

import { formatLoginError, useXSignIn } from './use-x-sign-in';
import { subscribeLoginError } from './login-error';

describe('formatLoginError', () => {
  it('maps the Privy rate-limit error code to actionable copy', () => {
    expect(
      formatLoginError({ privyErrorCode: 'too_many_requests', message: 'whatever' }),
    ).toMatch(/rate-limited/i);
  });

  it('maps a provider rate-limit message to the same copy', () => {
    expect(formatLoginError(new Error('Twitter provider rate limit reached'))).toMatch(
      /rate-limited/i,
    );
  });

  it('surfaces other errors instead of hiding them', () => {
    const message = formatLoginError(new Error('network boom'));
    expect(message).toMatch(/couldn't sign in/i);
    expect(message).toContain('network boom');
  });

  it('falls back to a generic message when there is no detail', () => {
    expect(formatLoginError(undefined)).toMatch(/couldn't sign in/i);
  });
});

function Harness() {
  const { signIn } = useXSignIn();
  return (
    <button type="button" onClick={signIn}>
      go
    </button>
  );
}

describe('useXSignIn', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('emits a friendly login error when initOAuth rejects', async () => {
    const errors: string[] = [];
    const unsubscribe = subscribeLoginError((message) => errors.push(message));
    initOAuthMock.mockRejectedValueOnce(new Error('provider rate limit'));

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      host.querySelector('button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    unsubscribe();
    expect(initOAuthMock).toHaveBeenCalledWith({ provider: 'twitter' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/rate-limited/i);
  });

  it('does not emit an error when sign-in starts successfully', async () => {
    const errors: string[] = [];
    const unsubscribe = subscribeLoginError((message) => errors.push(message));
    initOAuthMock.mockResolvedValueOnce(undefined);

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      host.querySelector('button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    unsubscribe();
    expect(errors).toHaveLength(0);
  });
});
