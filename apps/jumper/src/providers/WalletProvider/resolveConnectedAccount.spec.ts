import { ChainType } from '@lifi/sdk';
import type { Account, WalletConnector } from '@lifi/widget-provider';
import { describe, expect, it } from 'vitest';
import { resolveConnectedAccount } from './resolveConnectedAccount';

const privyConnector: WalletConnector = {
  id: 'privy-account',
  name: 'Privy Account',
};

function buildDisconnectedAccount(chainType: ChainType): Account {
  return {
    chainType,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: 'disconnected',
  };
}

describe('resolveConnectedAccount', () => {
  it('keeps an already connected account unchanged', () => {
    const connectedAccount: Account = {
      ...buildDisconnectedAccount(ChainType.EVM),
      address: '0xprimary',
      chainId: 1,
      connector: { id: 'wagmi', name: 'Wagmi' },
      isConnected: true,
      isDisconnected: false,
      status: 'connected',
    };

    expect(
      resolveConnectedAccount({
        account: connectedAccount,
        authenticated: true,
        connector: privyConnector,
        defaultChainId: 1,
        fallbackAddress: '0xfallback',
        ready: true,
      }),
    ).toEqual(connectedAccount);
  });

  it('falls back to the canonical wallet address when the direct provider is not ready', () => {
    expect(
      resolveConnectedAccount({
        account: buildDisconnectedAccount(ChainType.SVM),
        authenticated: true,
        connector: privyConnector,
        defaultChainId: 1151111081099710,
        fallbackAddress: 'So11111111111111111111111111111111111111112',
        ready: true,
      }),
    ).toEqual({
      address: 'So11111111111111111111111111111111111111112',
      chainId: 1151111081099710,
      chainType: ChainType.SVM,
      connector: privyConnector,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: 'connected',
    });
  });

  it('preserves address arrays when falling back for utxo wallets', () => {
    expect(
      resolveConnectedAccount({
        account: buildDisconnectedAccount(ChainType.UTXO),
        authenticated: true,
        connector: privyConnector,
        defaultChainId: 20000000000001,
        fallbackAddress: 'bc1qexample',
        fallbackAddresses: ['bc1qexample'],
        ready: true,
      }),
    ).toMatchObject({
      address: 'bc1qexample',
      addresses: ['bc1qexample'],
      chainId: 20000000000001,
      chainType: ChainType.UTXO,
      isConnected: true,
      status: 'connected',
    });
  });

  it('stays disconnected when no fallback address is available', () => {
    expect(
      resolveConnectedAccount({
        account: buildDisconnectedAccount(ChainType.MVM),
        authenticated: true,
        connector: privyConnector,
        defaultChainId: 784,
        ready: true,
      }),
    ).toEqual(buildDisconnectedAccount(ChainType.MVM));
  });

  it('does not mark fallback accounts connected before auth is ready', () => {
    expect(
      resolveConnectedAccount({
        account: buildDisconnectedAccount(ChainType.EVM),
        authenticated: true,
        connector: privyConnector,
        defaultChainId: 1,
        fallbackAddress: '0xfallback',
        ready: false,
      }),
    ).toEqual(buildDisconnectedAccount(ChainType.EVM));
  });
});
