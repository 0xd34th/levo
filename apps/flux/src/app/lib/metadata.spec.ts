import { describe, expect, it } from 'vitest';
import { defaultCoinbaseConfig } from '@/config/coinbase';
import { defaultMetaMaskConfig } from '@/config/metaMask';
import { defaultWalletConnectConfig } from '@/config/walletConnect';
import { JUMPER_DOMAIN } from '@/const/domain';
import { JUMPER_URL } from '@/const/urls';
import {
  baseMiniApp,
  pageMetadataFields,
  pageOpenGraph,
  pageTwitter,
  siteName,
} from './metadata';

describe('xterm.fi metadata', () => {
  it('uses xterm.fi as the public brand and domain', () => {
    expect(siteName).toBe('xterm.fi');
    expect(JUMPER_DOMAIN).toBe('xterm.fi');
    expect(JUMPER_URL).toBe('https://xterm.fi');
  });

  it('uses xterm.fi in page, OpenGraph, Twitter, and mini app metadata', () => {
    expect(pageMetadataFields.default.title).toBe(
      'xterm.fi | Smart App for the Universal Market',
    );
    expect(pageMetadataFields.default.description).toContain('xterm.fi');
    expect(pageMetadataFields.earn.title).toBe(
      'xterm.fi Earn | Earn Smarter Across Chains',
    );
    expect(pageOpenGraph.default?.siteName).toBe('xterm.fi');
    expect(pageTwitter.default?.site).toBe('xterm.fi');
    expect(baseMiniApp.miniAppName).toBe('xterm.fi');
  });

  it('uses xterm.fi wallet metadata and icons', () => {
    const walletConnectMetadata = defaultWalletConnectConfig.metadata;

    expect(walletConnectMetadata).toBeDefined();
    expect(walletConnectMetadata?.name).toContain('xterm.fi');
    expect(walletConnectMetadata?.url).toBe('https://xterm.fi');
    expect(walletConnectMetadata?.icons).toEqual([
      'https://xterm.fi/logo-144x144.svg',
    ]);

    expect(defaultCoinbaseConfig.appName).toBe('xterm.fi');
    expect(defaultCoinbaseConfig.appLogoUrl).toBe(
      'https://xterm.fi/logo-144x144.svg',
    );

    expect(defaultMetaMaskConfig.dappMetadata?.name).toBe('xterm.fi');
    expect(defaultMetaMaskConfig.dappMetadata?.iconUrl).toBe(
      'https://xterm.fi/logo-144x144.svg',
    );
  });
});
