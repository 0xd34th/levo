import { ChainType } from '@lifi/sdk';
import { describe, expect, it } from 'vitest';
import {
  buildWalletFleetResponse,
  getMissingPrivyWalletChains,
  mapFleetChainToLifiChainType,
  mapLifiChainTypeToFleetChain,
  mapPrivyChainTypeToFleetChain,
} from './wallet-fleet';

describe('wallet-fleet', () => {
  it('maps lifi chain types to canonical fleet chains', () => {
    expect(mapLifiChainTypeToFleetChain(ChainType.EVM)).toBe('evm');
    expect(mapLifiChainTypeToFleetChain(ChainType.SVM)).toBe('solana');
    expect(mapLifiChainTypeToFleetChain(ChainType.MVM)).toBe('sui');
    expect(mapLifiChainTypeToFleetChain(ChainType.UTXO)).toBe('bitcoin');
  });

  it('maps canonical fleet chains back to lifi chain types', () => {
    expect(mapFleetChainToLifiChainType('evm')).toBe(ChainType.EVM);
    expect(mapFleetChainToLifiChainType('solana')).toBe(ChainType.SVM);
    expect(mapFleetChainToLifiChainType('sui')).toBe(ChainType.MVM);
    expect(mapFleetChainToLifiChainType('bitcoin')).toBe(ChainType.UTXO);
  });

  it('normalizes Privy linked accounts into a wallet fleet response', () => {
    const response = buildWalletFleetResponse({
      linkedAccounts: [
        {
          address: 'user@example.com',
          type: 'email',
        },
        {
          address: '0x1234',
          chain_type: 'ethereum',
          connector_type: 'embedded',
          id: 'wallet-evm',
          type: 'wallet',
          wallet_client: 'privy',
        },
        {
          address: 'So11111111111111111111111111111111111111112',
          chain_type: 'solana',
          connector_type: 'embedded',
          id: 'wallet-sol',
          type: 'wallet',
          wallet_client: 'privy',
          public_key: 'sol-public-key',
        },
        {
          address: '0xsui',
          chain_type: 'sui',
          connector_type: 'embedded',
          id: 'wallet-sui',
          type: 'wallet',
          wallet_client: 'privy',
          public_key: 'sui-public-key',
        },
      ],
      userId: 'privy-user-1',
    });

    expect(response.user).toEqual({
      email: 'user@example.com',
      id: 'privy-user-1',
      loginMethod: 'email',
    });
    expect(response.wallets.evm?.walletId).toBe('wallet-evm');
    expect(response.wallets.solana?.publicKey).toBe('sol-public-key');
    expect(response.wallets.sui?.chainType).toBe(ChainType.MVM);
    expect(response.readyStates.bitcoin).toBe(false);
  });

  it('prefers the first canonical embedded wallet for each chain', () => {
    const response = buildWalletFleetResponse({
      linkedAccounts: [
        {
          address: 'first@example.com',
          type: 'google_oauth',
          email: 'first@example.com',
        },
        {
          address: '0xabc',
          chain_type: 'ethereum',
          connector_type: 'embedded',
          id: 'wallet-first',
          type: 'wallet',
          wallet_client: 'privy',
        },
        {
          address: '0xdef',
          chain_type: 'ethereum',
          connector_type: 'embedded',
          id: 'wallet-second',
          type: 'wallet',
          wallet_client: 'privy',
        },
      ],
      userId: 'privy-user-2',
    });

    expect(response.user.loginMethod).toBe('google');
    expect(response.wallets.evm?.walletId).toBe('wallet-first');
  });

  it('reports wallet login when the user signs in with an external wallet', () => {
    const response = buildWalletFleetResponse({
      linkedAccounts: [
        {
          address: '0xexternal',
          chain_type: 'ethereum',
          connector_type: 'injected',
          id: 'external-wallet',
          type: 'wallet',
          wallet_client: 'metamask',
        },
        {
          address: '0xembedded',
          chain_type: 'ethereum',
          connector_type: 'embedded',
          id: 'wallet-evm',
          type: 'wallet',
          wallet_client: 'privy',
        },
      ],
      userId: 'privy-user-wallet',
    });

    expect(response.user).toEqual({
      email: null,
      id: 'privy-user-wallet',
      loginMethod: 'wallet',
    });
    expect(response.wallets.evm?.walletId).toBe('wallet-evm');
  });

  it('reports which canonical wallets are still missing', () => {
    const response = buildWalletFleetResponse({
      linkedAccounts: [
        {
          address: '0x1234',
          chain_type: 'ethereum',
          connector_type: 'embedded',
          id: 'wallet-evm',
          type: 'wallet',
          wallet_client: 'privy',
        },
      ],
      userId: 'privy-user-3',
    });

    expect(getMissingPrivyWalletChains(response.wallets)).toEqual([
      'solana',
      'sui',
      'bitcoin-segwit',
    ]);
  });

  it('ignores unsupported privy chain types when building the fleet', () => {
    const response = buildWalletFleetResponse({
      linkedAccounts: [
        {
          address: '0x1234',
          chain_type: 'ethereum',
          connector_type: 'embedded',
          id: 'wallet-evm',
          type: 'wallet',
          wallet_client: 'privy',
        },
        {
          address: '0xmovement',
          chain_type: 'movement',
          connector_type: 'embedded',
          id: 'wallet-move',
          type: 'wallet',
          wallet_client: 'privy',
        },
      ],
      userId: 'privy-user-4',
    });

    expect(mapPrivyChainTypeToFleetChain('movement')).toBeUndefined();
    expect(response.wallets.sui).toBeUndefined();
  });
});
