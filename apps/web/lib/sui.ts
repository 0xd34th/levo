import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { deriveObjectID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet') || 'testnet';
const rpcUrl = process.env.SUI_RPC_URL?.trim();

let _client: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!_client) {
    _client = new SuiJsonRpcClient({
      url: rpcUrl || getJsonRpcFullnodeUrl(network),
      network,
    });
  }
  return _client;
}

/**
 * Compute the deterministic vault address for a given x_user_id.
 * Matches the on-chain `derived_object::derive_address(registry.id, x_user_id)`.
 */
export function deriveVaultAddress(registryId: string, xUserId: bigint): string {
  const keyBytes = bcs.u64().serialize(xUserId).toBytes();
  return deriveObjectID(registryId, 'u64', keyBytes);
}
