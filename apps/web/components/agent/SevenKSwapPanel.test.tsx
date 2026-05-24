/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from '@/lib/coins';

const {
  fetchMock,
  generateAuthorizationSignatureMock,
  getAccessTokenMock,
  useEmbeddedWalletMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  generateAuthorizationSignatureMock: vi.fn(),
  getAccessTokenMock: vi.fn(async () => 'access-token'),
  useEmbeddedWalletMock: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: generateAuthorizationSignatureMock,
  }),
  useIdentityToken: () => ({ identityToken: null }),
  usePrivy: () => ({ getAccessToken: getAccessTokenMock }),
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => useEmbeddedWalletMock(),
}));

import { SevenKSwapPanel } from './SevenKSwapPanel';

function inputByLabel(host: HTMLElement, label: string) {
  const field = Array.from(host.querySelectorAll('input,select')).find((candidate) =>
    candidate.getAttribute('aria-label') === label,
  );
  if (!field) throw new Error(`Field not found: ${label}`);
  return field as HTMLInputElement | HTMLSelectElement;
}

function buttonByText(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button as HTMLButtonElement;
}

function queryButtonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function flushAutoQuote() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

describe('SevenKSwapPanel', () => {
  let host: HTMLDivElement;
  let root: Root;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    globalThis.fetch = fetchMock;
    useEmbeddedWalletMock.mockReturnValue({
      suiAddress: '0xwallet',
      loading: false,
      error: null,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('does not quote outside mainnet and renders clear copy', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';

    await act(async () => {
      root.render(<SevenKSwapPanel />);
    });
    await typeInto(inputByLabel(host, 'Swap amount') as HTMLInputElement, '1');
    await flushAutoQuote();

    expect(host.textContent).toContain('Swap is available on Sui mainnet only.');
    expect(queryButtonByText(host, 'Get quote')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not auto quote for invalid amount, missing wallet, or same-token pair', async () => {
    useEmbeddedWalletMock.mockReturnValue({
      suiAddress: null,
      loading: false,
      error: null,
    });

    await act(async () => {
      root.render(<SevenKSwapPanel />);
    });
    await typeInto(inputByLabel(host, 'Swap amount') as HTMLInputElement, '1');
    await flushAutoQuote();
    expect(fetchMock).not.toHaveBeenCalled();

    useEmbeddedWalletMock.mockReturnValue({
      suiAddress: '0xwallet',
      loading: false,
      error: null,
    });
    await act(async () => {
      root.render(<SevenKSwapPanel />);
    });

    await typeInto(inputByLabel(host, 'Swap amount') as HTMLInputElement, '0');
    await flushAutoQuote();
    expect(fetchMock).not.toHaveBeenCalled();

    await typeInto(inputByLabel(host, 'Swap amount') as HTMLInputElement, '1');
    await act(async () => {
      const output = inputByLabel(host, 'To coin') as HTMLSelectElement;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(output, SUI_COIN_TYPE);
      output.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushAutoQuote();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('auto renders quote review fields from the swap quote response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      swapQuoteToken: 'swap-token',
      provider: 'bluefin7k',
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amountIn: '1000000000',
      amountOut: '2500000',
      minAmountOut: '2475000',
      slippageBps: 100,
      expiresAt: '2026-01-01T00:05:00.000Z',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await act(async () => {
      root.render(<SevenKSwapPanel />);
    });
    await typeInto(inputByLabel(host, 'Swap amount') as HTMLInputElement, '1');
    await flushAutoQuote();

    expect(host.textContent).toContain('bluefin7k');
    expect(host.textContent).toContain('2.50 USDC');
    expect(host.textContent).toContain('2.47 USDC');
    expect(host.textContent).toContain('1.00%');
  });

  it('does not submit swap execution before Privy authorization completes', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        swapQuoteToken: 'swap-token',
        provider: 'bluefin7k',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2500000',
        minAmountOut: '2475000',
        slippageBps: 100,
        expiresAt: '2026-01-01T00:05:00.000Z',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'authorization_required',
        authorizationRequest: {
          version: 1,
          method: 'POST',
          url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
          body: {},
          headers: { 'privy-app-id': 'privy-app-id' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'confirmed',
        txDigest: 'swap-digest',
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    generateAuthorizationSignatureMock.mockResolvedValueOnce({ signature: 'auth-signature' });

    await act(async () => {
      root.render(<SevenKSwapPanel />);
    });
    await typeInto(inputByLabel(host, 'Swap amount') as HTMLInputElement, '1');
    await flushAutoQuote();
    await act(async () => {
      buttonByText(host, 'Execute swap').click();
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/swap/execute',
      expect.objectContaining({
        body: JSON.stringify({ swapQuoteToken: 'swap-token' }),
      }),
    );
    expect(generateAuthorizationSignatureMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/swap/execute',
      expect.objectContaining({
        body: JSON.stringify({
          swapQuoteToken: 'swap-token',
          authorizationSignature: 'auth-signature',
        }),
      }),
    );
    expect(host.textContent).toContain('swap-digest');
  });
});
