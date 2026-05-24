/* eslint-disable @next/next/no-img-element */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSelectableCoinOptionsMock,
} = vi.hoisted(() => ({
  getSelectableCoinOptionsMock: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    ...props
  }: {
    alt: string;
    src: string;
  }) => <img alt={alt} src={src} {...props} />,
}));

vi.mock('@/lib/coins', () => ({
  getSelectableCoinOptions: getSelectableCoinOptionsMock,
}));

import { CoinSelector } from './coin-selector';

describe('CoinSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSelectableCoinOptionsMock.mockReturnValue([
      {
        coinType: 'mainnet-usdc',
        label: 'USDC',
        caption: 'Stablecoin',
        iconSrc: '/USDC.svg',
      },
      {
        coinType: '0x2::sui::SUI',
        label: 'SUI',
        caption: 'Native',
        iconSrc: '/sui.svg',
      },
    ]);
  });

  it('renders the public USDC and SUI svg assets for the selectable coins', () => {
    const markup = renderToStaticMarkup(
      <CoinSelector value="mainnet-usdc" onValueChange={vi.fn()} />,
    );

    expect(markup).toContain('src="/USDC.svg"');
    expect(markup).toContain('alt="USDC icon"');
    expect(markup).toContain('src="/sui.svg"');
    expect(markup).toContain('alt="SUI icon"');
  });

  it('renders configured allowlist coins after built-ins', () => {
    getSelectableCoinOptionsMock.mockReturnValue([
      {
        coinType: 'mainnet-usdc',
        label: 'USDC',
        caption: 'Stablecoin',
        iconSrc: '/USDC.svg',
      },
      {
        coinType: '0x2::sui::SUI',
        label: 'SUI',
        caption: 'Native',
        iconSrc: '/sui.svg',
      },
      {
        coinType: '0x123::foo::FOO',
        label: 'FOO',
        caption: 'Foo token',
        iconSrc: '/foo.svg',
      },
    ]);

    const markup = renderToStaticMarkup(
      <CoinSelector value="0x123::foo::FOO" onValueChange={vi.fn()} />,
    );

    expect(markup.indexOf('USDC')).toBeLessThan(markup.indexOf('SUI'));
    expect(markup.indexOf('SUI')).toBeLessThan(markup.indexOf('FOO'));
    expect(markup).toContain('src="/sui.svg"');
    expect(markup).toContain('src="/foo.svg"');
    expect(markup).toContain('alt="FOO icon"');
  });
});
