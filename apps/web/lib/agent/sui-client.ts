import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// Agent flows always talk to Sui testnet — independent of NEXT_PUBLIC_SUI_NETWORK,
// which the main app uses for the levo USDC/USDB flows. This avoids accidentally
// signing agent transactions against the wrong network when the user runs the
// main app on mainnet (current default).
//
// To override (e.g. for a private testnet fullnode), set LEVO_AGENT_SUI_RPC_URL.

let _client: SuiJsonRpcClient | null = null;

export function getAgentSuiClient(): SuiJsonRpcClient {
  if (!_client) {
    const url = process.env.LEVO_AGENT_SUI_RPC_URL?.trim() || getJsonRpcFullnodeUrl('testnet');
    _client = new SuiJsonRpcClient({ url, network: 'testnet' });
  }
  return _client;
}

export const AGENT_NETWORK = 'testnet' as const;
