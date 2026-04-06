import { ed25519 } from '@noble/curves/ed25519.js';
import { z } from 'zod';
import { bytesToHex, hexToBytes, normalizeSuiAddress } from './schema';

const EnvSchema = z.object({
  HOST: z.string().trim().optional(),
  PORT: z.string().trim().optional(),
  ENCLAVE_REGISTRY_ID: z.string().trim().min(1),
  NAUTILUS_SIGNER_SECRET: z.string().trim().min(32),
  NAUTILUS_SIGNER_SEED_BASE64: z.string().trim().min(1),
  NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY: z.string().trim().optional(),
});

function parsePort(value: string | undefined): number {
  if (!value) {
    return 8787;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('Invalid PORT');
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('Invalid PORT');
  }

  return parsed;
}

function decodeSeed(seedBase64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(seedBase64) || seedBase64.length % 4 !== 0) {
    throw new Error('Invalid NAUTILUS_SIGNER_SEED_BASE64');
  }

  const seed = Buffer.from(seedBase64, 'base64');
  if (seed.length !== 32) {
    throw new Error('Invalid NAUTILUS_SIGNER_SEED_BASE64');
  }

  return new Uint8Array(seed);
}

function normalizePublicKeyHex(value: string): string {
  const bytes = hexToBytes(value, 'NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY');
  if (bytes.length !== 32) {
    throw new Error('Invalid NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY');
  }

  return `0x${bytesToHex(bytes)}`;
}

export interface SignerConfig {
  host: string;
  port: number;
  registryId: string;
  signerSecret: string;
  seedBase64: string;
  seed: Uint8Array;
  publicKeyBytes: Uint8Array;
  publicKeyHex: string;
  expectedPublicKeyHex?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SignerConfig {
  const parsed = EnvSchema.parse(env);
  const expectedPublicKeyValue = parsed.NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY?.trim();
  if (!expectedPublicKeyValue) {
    throw new Error('Missing NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY');
  }

  const seed = decodeSeed(parsed.NAUTILUS_SIGNER_SEED_BASE64.trim());
  const publicKeyBytes = ed25519.getPublicKey(seed);
  const publicKeyHex = `0x${bytesToHex(publicKeyBytes)}`;
  const expectedPublicKeyHex = normalizePublicKeyHex(expectedPublicKeyValue);

  if (expectedPublicKeyHex !== publicKeyHex) {
    throw new Error(
      `Nautilus signer public key mismatch: expected ${expectedPublicKeyHex}, derived ${publicKeyHex}`,
    );
  }

  return {
    host: parsed.HOST?.trim() || '127.0.0.1',
    port: parsePort(parsed.PORT?.trim()),
    registryId: normalizeSuiAddress(parsed.ENCLAVE_REGISTRY_ID),
    signerSecret: parsed.NAUTILUS_SIGNER_SECRET.trim(),
    seedBase64: parsed.NAUTILUS_SIGNER_SEED_BASE64.trim(),
    seed,
    publicKeyBytes,
    publicKeyHex,
    expectedPublicKeyHex,
  };
}
