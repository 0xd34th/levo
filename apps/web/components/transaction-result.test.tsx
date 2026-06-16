import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SUI_COIN_TYPE } from '@/lib/coins';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  buildXPaymentNotificationIntent,
  TransactionResult,
  type TransactionResultData,
} from './transaction-result';

const baseResult: TransactionResultData = {
  amount: '12.5',
  coinType: SUI_COIN_TYPE,
  username: 'death_xyz',
  txDigest: '11111111111111111111111111111111',
  recipientType: 'X_HANDLE',
};

function getNotifyHref(markup: string): string {
  const match = markup.match(/href="([^"]+)"[^>]*>Notify on X/);
  expect(match?.[1]).toBeDefined();
  return match![1].replaceAll('&amp;', '&');
}

describe('TransactionResult', () => {
  it('does not throw for unsupported coin types', () => {
    expect(() =>
      renderToStaticMarkup(
        <TransactionResult
          data={{
            amount: '1',
            coinType: '0xabc::other::OTHER',
            username: 'death_xyz',
            txDigest: '11111111111111111111111111111111',
          }}
          network="testnet"
          onReset={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });

  it('builds an editable X intent for payment notifications', () => {
    const href = buildXPaymentNotificationIntent({
      username: '@death_xyz',
      amount: '12.5',
      coinLabel: 'SUI',
      appUrl: 'https://levo.finance',
    });

    const url = new URL(href);
    expect(`${url.origin}${url.pathname}`).toBe('https://x.com/intent/tweet');
    expect(url.searchParams.get('text')).toBe(
      '@death_xyz I sent you 12.5 SUI on Levo. Sign in with X to view it.',
    );
    expect(url.searchParams.get('url')).toBe('https://levo.finance');
  });

  it('renders a Notify on X link for successful X handle sends', () => {
    const markup = renderToStaticMarkup(
      <TransactionResult data={baseResult} network="testnet" onReset={vi.fn()} />,
    );
    const href = getNotifyHref(markup);
    const url = new URL(href);

    expect(markup).toContain('Notify on X');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(`${url.origin}${url.pathname}`).toBe('https://x.com/intent/tweet');
    expect(url.searchParams.get('text')).toContain('@death_xyz');
    expect(url.searchParams.get('text')).toContain('12.5');
    expect(url.searchParams.get('text')).toContain('SUI');
    expect(url.searchParams.get('text')).toContain('Sign in with X to view it');
    expect(url.searchParams.get('url')).toBe('https://levo.finance');
  });

  it('does not render Notify on X for direct Sui address sends', () => {
    const markup = renderToStaticMarkup(
      <TransactionResult
        data={{
          ...baseResult,
          username: '0x1234',
          recipientType: 'SUI_ADDRESS',
        }}
        network="testnet"
        onReset={vi.fn()}
      />,
    );

    expect(markup).not.toContain('Notify on X');
    expect(markup).not.toContain('x.com/intent/tweet');
  });
});
