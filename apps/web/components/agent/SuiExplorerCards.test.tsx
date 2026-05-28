import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SuiToolCard } from './SuiExplorerCards';

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
