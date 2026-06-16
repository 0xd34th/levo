/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LoginErrorBanner } from './login-error-banner';
import { emitLoginError } from '@/lib/login-error';

describe('LoginErrorBanner', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('shows an emitted login error and lets the user dismiss it', async () => {
    await act(async () => {
      root.render(<LoginErrorBanner />);
    });

    expect(host.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      emitLoginError('Sign-in with X is being rate-limited right now.');
    });

    const alert = host.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(host.textContent).toContain('rate-limited');

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')?.click();
    });

    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
