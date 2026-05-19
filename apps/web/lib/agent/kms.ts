import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

// Platform-controlled agent signer (D-1 decision: env-stored Ed25519 seed for V1).
// LEVO_AGENT_SIGNER_SECRET_KEY must be a base64-encoded 32-byte Ed25519 seed
// (generate via `openssl rand -base64 32`). For production, this module's contract
// is intended to be re-implemented against AWS KMS without changing call sites.

const ED25519_SEED_BYTES = 32;

let _keypair: Ed25519Keypair | null = null;

function loadKeypairFromEnv(): Ed25519Keypair {
  const raw = process.env.LEVO_AGENT_SIGNER_SECRET_KEY?.trim();
  if (!raw || raw === 'replace-me') {
    throw new Error(
      'LEVO_AGENT_SIGNER_SECRET_KEY is not configured. Generate a base64 Ed25519 seed via `openssl rand -base64 32`.',
    );
  }
  let seed: Uint8Array;
  try {
    seed = fromBase64(raw);
  } catch (err) {
    throw new Error(
      `LEVO_AGENT_SIGNER_SECRET_KEY is not valid base64: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
  if (seed.length !== ED25519_SEED_BYTES) {
    throw new Error(
      `LEVO_AGENT_SIGNER_SECRET_KEY must decode to ${ED25519_SEED_BYTES} bytes; got ${seed.length}`,
    );
  }
  return Ed25519Keypair.fromSecretKey(seed);
}

export function getAgentKeypair(): Ed25519Keypair {
  if (!_keypair) {
    _keypair = loadKeypairFromEnv();
  }
  return _keypair;
}

export function getAgentAddress(): string {
  return getAgentKeypair().getPublicKey().toSuiAddress();
}

export function isAgentSignerConfigured(): boolean {
  const raw = process.env.LEVO_AGENT_SIGNER_SECRET_KEY?.trim();
  return Boolean(raw) && raw !== 'replace-me';
}

// Test-only escape hatch: reset memoized keypair so subsequent reads pick up new env.
// Real code paths should not call this.
export function __resetAgentKeypairForTests(): void {
  _keypair = null;
}

// Convenience: sign Sui transaction bytes with the agent key. Used by the runtime
// executor when submitting consume_witness PTBs (sender == mandate.agent).
export async function signTransactionAsAgent(txBytes: Uint8Array): Promise<{
  signature: string;
  bytes: string;
}> {
  return getAgentKeypair().signTransaction(txBytes);
}

// Convenience: sign a personal message with the agent key. Used by Seal SDK
// `SessionKey.setPersonalMessageSignature()` when bootstrapping a decryption session.
export async function signPersonalMessageAsAgent(message: Uint8Array): Promise<{
  signature: string;
  bytes: string;
}> {
  return getAgentKeypair().signPersonalMessage(message);
}
