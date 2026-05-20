import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

let managerKeypair: Ed25519Keypair | null = null;

export function getStableLayerManagerKeypair(): Ed25519Keypair | null {
  if (managerKeypair) {
    return managerKeypair;
  }

  const secretKey = process.env.STABLE_LAYER_MANAGER_SECRET_KEY?.trim();
  if (!secretKey) {
    return null;
  }

  managerKeypair = Ed25519Keypair.fromSecretKey(fromBase64(secretKey));
  return managerKeypair;
}

export function getStableLayerManagerAddress(): string | null {
  return getStableLayerManagerKeypair()?.toSuiAddress() ?? null;
}
