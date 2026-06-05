/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockSendButtonProps = {
  amount: string;
  coinType: string;
  username: string;
  recipientType: string | null;
  embeddedWalletAddress?: string | null;
  availableBalance?: string | null;
  onConfirm: (data: {
    amount: string;
    coinType: string;
    username: string;
    txDigest: string;
    recipientType: string;
  }) => void;
  onError: (error: string | null) => void;
};

const {
  sendButtonProps,
  useCoinBalanceMock,
  walletState,
} = vi.hoisted(() => ({
  sendButtonProps: [] as MockSendButtonProps[],
  useCoinBalanceMock: vi.fn((_address: string | null | undefined, coinType: string) => ({
    balance: coinType === '0x2::sui::SUI' ? '10000000000' : '2500',
    loading: false,
  })),
  walletState: {
    suiAddress: '0xowner',
    loading: false,
    error: null as string | null,
  },
}));

vi.mock('@/components/send-button', () => ({
  SendButton: (props: MockSendButtonProps) => {
    sendButtonProps.push(props);
    return (
      <button
        type="button"
        data-testid="mock-send-button"
        data-amount={props.amount}
        data-coin-type={props.coinType}
        data-username={props.username}
        data-recipient-type={props.recipientType ?? ''}
        data-available-balance={props.availableBalance ?? ''}
        onClick={() =>
          props.onConfirm({
            amount: props.amount,
            coinType: props.coinType,
            username: props.username,
            txDigest: 'mock-digest',
            recipientType: props.recipientType ?? 'SUI_ADDRESS',
          })
        }
      >
        Mock send button
      </button>
    );
  },
}));

vi.mock('@/components/transaction-result', () => ({
  TransactionResult: ({ data }: { data: { txDigest?: string } | null }) =>
    data ? <div data-testid="mock-transaction-result">Confirmed {data.txDigest}</div> : null,
}));

vi.mock('@/lib/use-coin-balance', () => ({
  useCoinBalance: (address: string | null | undefined, coinType: string) =>
    useCoinBalanceMock(address, coinType),
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => walletState,
}));

import { SuiToolCard } from './SuiExplorerCards';

function renderClientCard(output: Record<string, unknown>): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<SuiToolCard output={output} />);
  });
  return { host, root };
}

function unmountClientCard(host: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  host.remove();
}

function transferPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'write-card',
    action: 'transfer',
    status: 'confirmation_required',
    recipient: '0x1234567890abcdef',
    coinType: '0x2::sui::SUI',
    symbol: 'SUI',
    amount: '1.5',
    message: 'Prepared only. Use the Review transfer button on this card before any transfer is signed.',
    ...overrides,
  };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sendButtonProps.length = 0;
  walletState.suiAddress = '0xowner';
  walletState.loading = false;
  walletState.error = null;
  useCoinBalanceMock.mockClear();
  useCoinBalanceMock.mockImplementation((_address: string | null | undefined, coinType: string) => ({
    balance: coinType === '0x2::sui::SUI' ? '10000000000' : '2500',
    loading: false,
  }));
});

describe('SuiToolCard result formatting', () => {
  it('renders trending results as rows instead of raw JSON', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'trending-card',
          source: 'blockvision',
          items: {
            data: [
              {
                symbol: 'SUI/USDC',
                poolId: '0x1234567890abcdef',
                volume24H: 123456,
              },
            ],
          },
        }}
      />,
    );

    expect(markup).toContain('Trending on Sui');
    expect(markup).toContain('SUI/USDC');
    expect(markup).not.toContain('&quot;kind&quot;');
    expect(markup).not.toContain('JSON');
  });

  it('renders provider fallback warnings on empty trending cards', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'trending-card',
          source: 'unavailable',
          items: [],
          warning: 'Trending markets unavailable: provider request timed out',
        }}
      />,
    );

    expect(markup).toContain('No trending markets returned.');
    expect(markup).toContain('Trending markets unavailable');
  });

  it('renders NFT collection summary fields instead of raw JSON', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'nft-card',
          source: 'blockvision',
          collection: 'Suipanda',
          data: {
            name: 'Suipanda',
            owners: 42,
            floorPrice: 1.25,
            verified: true,
          },
        }}
      />,
    );

    expect(markup).toContain('Suipanda');
    expect(markup).toContain('Owners');
    expect(markup).toContain('Verified');
    expect(markup).not.toContain('&quot;kind&quot;');
  });

  it('renders empty DeFi results without repeating raw provider errors', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'defi-card',
          address: '0x1234567890abcdef',
          source: 'unavailable',
          positions: [],
          warning: 'BlockVision 404 /account/defi/positions',
        }}
      />,
    );

    expect(markup).toContain('No DeFi positions returned.');
    expect(markup).toContain('Provider data is unavailable right now.');
    expect(markup).not.toContain('BlockVision 404 /account/defi/positions');
  });

  it('sanitizes provider endpoint errors on NFT cards', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'nft-card',
          collection: 'suipanda',
          source: 'unavailable',
          data: {},
          warning: 'NFT collection unavailable: BlockVision 404 /nft/collection/detail',
        }}
      />,
    );

    expect(markup).toContain('Provider data is unavailable right now.');
    expect(markup).not.toContain('/nft/collection/detail');
  });

  it('falls back to the coin type symbol on swap cards', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'write-card',
          action: 'swap',
          status: 'unavailable',
          tokenIn: { symbol: 'SUI' },
          tokenOut: {
            symbol: '?',
            coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
          },
          amountInHuman: '1',
          message: 'Live swap quotes are unavailable right now. No wallet action has been prepared.',
        }}
      />,
    );

    expect(markup).toContain('Unavailable USDC');
    expect(markup).not.toContain('Unavailable ?');
  });

  it('renders a local swap panel link when write-card carries an href', () => {
    const markup = renderToStaticMarkup(
      <SuiToolCard
        output={{
          kind: 'write-card',
          action: 'swap',
          status: 'open_local_surface',
          href: '/agent/new?surface=swap',
          tokenIn: { symbol: 'SUI' },
          tokenOut: { symbol: 'USDC' },
          amountInHuman: '1',
          amountOutHuman: 'Open panel',
          message: 'Open the local swap panel to quote and execute with explicit wallet approval.',
        }}
      />,
    );

    expect(markup).toContain('Open swap panel');
    expect(markup).toContain('href="/agent/new?surface=swap"');
  });
});

describe('SuiToolCard transfer write cards', () => {
  it('renders an inline frontend approval button and confirmation result', () => {
    const { host, root } = renderClientCard(transferPayload());

    expect(host.textContent).toContain('Transfer prepared');
    expect(host.textContent).toContain('Review transfer');
    const sendButton = host.querySelector<HTMLButtonElement>('[data-testid="mock-send-button"]');
    expect(sendButton).toBeTruthy();

    act(() => {
      sendButton?.click();
    });
    expect(host.textContent).toContain('Confirmed mock-digest');

    unmountClientCard(host, root);
  });

  it('passes transfer amount, coin type, recipient, recipient type, and balance into SendButton', () => {
    const { host, root } = renderClientCard(
      transferPayload({
        recipient: '0xabcdefabcdefabcdef',
        coinType: '0x123::foo::FOO',
        symbol: 'FOO',
        amount: '2.25',
      }),
    );

    const props = sendButtonProps[sendButtonProps.length - 1];
    expect(props).toMatchObject({
      amount: '2.25',
      coinType: '0x123::foo::FOO',
      username: '0xabcdefabcdefabcdef',
      recipientType: 'SUI_ADDRESS',
      embeddedWalletAddress: '0xowner',
      availableBalance: '2500',
    });
    expect(useCoinBalanceMock).toHaveBeenCalledWith('0xowner', '0x123::foo::FOO');

    unmountClientCard(host, root);
  });

  it('uses the original .sui recipient from recipientResolvedFrom for the send flow', () => {
    const { host, root } = renderClientCard(
      transferPayload({
        recipient: '0xabcdefabcdefabcdef',
        recipientResolvedFrom: 'alice.sui',
      }),
    );

    const props = sendButtonProps[sendButtonProps.length - 1];
    expect(props).toMatchObject({
      username: 'alice.sui',
      recipientType: 'SUI_ADDRESS',
    });

    unmountClientCard(host, root);
  });
});
