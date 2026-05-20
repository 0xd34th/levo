import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

let _gasKeypair: Ed25519Keypair | null = null;

/**
 * Get the server-side gas station keypair for sponsoring transactions.
 * The private key is stored in GAS_STATION_SECRET_KEY env var (base64-encoded 32-byte seed).
 *
 * Returns null if not configured — callers should fall back to unsponsored transactions.
 */
export function getGasStationKeypair(): Ed25519Keypair | null {
  if (_gasKeypair) return _gasKeypair;

  const secretKey = process.env.GAS_STATION_SECRET_KEY;
  if (!secretKey) return null;

  // Malformed key is a configuration error — throw so callers can surface it
  // instead of silently falling back to unsponsored transactions.
  const seed = fromBase64(secretKey);
  _gasKeypair = Ed25519Keypair.fromSecretKey(seed);
  return _gasKeypair;
}

/**
 * Get the gas station's Sui address, if configured.
 */
export function getGasStationAddress(): string | null {
  const keypair = getGasStationKeypair();
  return keypair?.toSuiAddress() ?? null;
}
