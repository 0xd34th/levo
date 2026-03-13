import { createDAppKit } from '@mysten/dapp-kit-core';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const SUPPORTED_NETWORKS = ['testnet', 'mainnet'] as const;

export const dAppKit = createDAppKit({
  networks: [...SUPPORTED_NETWORKS],
  createClient: (network) =>
    new SuiJsonRpcClient({
      network,
      url: getJsonRpcFullnodeUrl(network as 'testnet' | 'mainnet'),
    }),
  defaultNetwork: 'testnet',
});
