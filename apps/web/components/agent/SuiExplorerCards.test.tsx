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
});
