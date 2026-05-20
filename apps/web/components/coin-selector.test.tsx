/* eslint-disable @next/next/no-img-element */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCoinLabelMock,
  getUserFacingUsdcCoinTypeMock,
} = vi.hoisted(() => ({
  getCoinLabelMock: vi.fn(),
  getUserFacingUsdcCoinTypeMock: vi.fn(),
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
  MAINNET_USDC_TYPE: 'mainnet-usdc',
  SUI_COIN_TYPE: '0x2::sui::SUI',
  getCoinLabel: getCoinLabelMock,
  getUserFacingUsdcCoinType: getUserFacingUsdcCoinTypeMock,
}));

import { CoinSelector } from './coin-selector';

describe('CoinSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCoinLabelMock.mockReturnValue('SUI');
  });

  it('renders the public USDC and SUI svg assets for the selectable coins', () => {
    getUserFacingUsdcCoinTypeMock.mockReturnValue('mainnet-usdc');

    const markup = renderToStaticMarkup(
      <CoinSelector value="mainnet-usdc" onValueChange={vi.fn()} />,
    );

    expect(markup).toContain('src="/USDC.svg"');
    expect(markup).toContain('alt="USDC icon"');
    expect(markup).toContain('src="/sui.svg"');
    expect(markup).toContain('alt="SUI icon"');
  });

  it('keeps the SUI svg when no stablecoin option is available', () => {
    getUserFacingUsdcCoinTypeMock.mockReturnValue(null);

    const markup = renderToStaticMarkup(
      <CoinSelector value="0x2::sui::SUI" onValueChange={vi.fn()} />,
    );

    expect(markup).not.toContain('src="/USDC.svg"');
    expect(markup).toContain('src="/sui.svg"');
    expect(markup).toContain('alt="SUI icon"');
  });
});
