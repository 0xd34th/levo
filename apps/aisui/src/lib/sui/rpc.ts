import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { env } from "@/lib/env";

let primaryClient: SuiJsonRpcClient | null = null;
let publicClient: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (!primaryClient) {
    primaryClient = new SuiJsonRpcClient({ url: env.suiRpcUrl(), network: "mainnet" });
  }
  return primaryClient;
}

/** Always-on Sui client tied to the public fallback fullnode (Mysten official by
 *  default). Keeps fallback paths working when SUI_RPC_URL points at a
 *  rate-limited gateway (BlockVision, etc.). */
export function getPublicSuiClient(): SuiJsonRpcClient {
  if (!publicClient) {
    publicClient = new SuiJsonRpcClient({ url: env.suiRpcPublicFallback(), network: "mainnet" });
  }
  return publicClient;
}

/** Lower-case + ensure leading 0x. Does NOT pad — use `normaliseObjectId` for
 *  ids that need the full 32-byte (64 hex char) form (Sui RPC is strict). */
export function normaliseAddress(addr: string): string {
  const trimmed = addr.trim();
  if (!trimmed.startsWith("0x")) return "0x" + trimmed;
  return trimmed.toLowerCase();
}

/**
 * Pad short Sui object / address ids to the full 32-byte form so RPC accepts
 * them. Sui shorthand like `0x6` (Clock), `0x2` (sui framework), `0x5` (sui
 * system state) are widely-used user-facing aliases that the RPC rejects with
 * a 404 unless padded.
 */
export function normaliseObjectId(id: string): string {
  const trimmed = id.trim();
  let hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  hex = hex.toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) return trimmed; // not hex — let the RPC complain
  if (hex.length > 64) return trimmed;
  return "0x" + hex.padStart(64, "0");
}
