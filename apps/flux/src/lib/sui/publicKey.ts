import type { PublicKey, SignatureScheme } from "@mysten/sui/cryptography";
import { SIGNATURE_FLAG_TO_SCHEME } from "@mysten/sui/cryptography";
import { fromBase58, fromBase64, fromHex } from "@mysten/sui/utils";
import {
  publicKeyFromRawBytes,
  publicKeyFromSuiBytes,
} from "@mysten/sui/verify";

export type DecodeSuiPublicKeyOptions = NonNullable<
  Parameters<typeof publicKeyFromRawBytes>[2]
>;

export type SuiPublicKeyInput = ArrayLike<number> | string;

type PublicKeyByteCandidate = {
  bytes: Uint8Array<ArrayBufferLike>;
  label: string;
};

export function decodeSuiPublicKey(
  publicKey: SuiPublicKeyInput,
  options?: DecodeSuiPublicKeyOptions,
): PublicKey {
  const errors: string[] = [];

  for (const candidate of publicKeyByteCandidates(publicKey)) {
    try {
      return decodeSuiPublicKeyBytes(candidate.bytes, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.label}: ${message}`);
    }
  }

  throw new Error(`Invalid Sui public key: ${errors.join("; ")}`);
}

function decodeSuiPublicKeyBytes(
  bytes: Uint8Array<ArrayBufferLike>,
  options?: DecodeSuiPublicKeyOptions,
): PublicKey {
  const errors: string[] = [];

  if (isSuiSignatureSchemeFlag(bytes[0])) {
    try {
      return publicKeyFromSuiBytes(bytes, options);
    } catch (error) {
      errors.push(`Sui bytes: ${errorMessage(error)}`);
    }
  }

  for (const scheme of rawPublicKeySchemes(bytes, options)) {
    try {
      return publicKeyFromRawBytes(scheme, bytes, options);
    } catch (error) {
      errors.push(`raw ${scheme}: ${errorMessage(error)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  throw new Error(
    `expected Sui public key bytes or address-validated raw public key bytes, received ${bytes.length} bytes`,
  );
}

function rawPublicKeySchemes(
  bytes: Uint8Array<ArrayBufferLike>,
  options?: DecodeSuiPublicKeyOptions,
): SignatureScheme[] {
  if (bytes.length === 32) {
    return ["ED25519"];
  }

  if (!options?.address) {
    return [];
  }

  if (bytes.length === 33) {
    return ["Secp256k1", "Secp256r1", "Passkey"];
  }

  return ["ZkLogin", "MultiSig"];
}

function publicKeyByteCandidates(
  publicKey: SuiPublicKeyInput,
): PublicKeyByteCandidate[] {
  if (typeof publicKey !== "string") {
    const bytes = new Uint8Array(publicKey);
    const candidates: PublicKeyByteCandidate[] = [{ label: "bytes", bytes }];
    const encodedPublicKey = asciiString(bytes);

    if (encodedPublicKey) {
      candidates.push(
        ...stringPublicKeyByteCandidates(encodedPublicKey).map((candidate) => ({
          ...candidate,
          label: `bytes as ${candidate.label}`,
        })),
      );
    }

    return candidates;
  }

  return stringPublicKeyByteCandidates(publicKey);
}

function stringPublicKeyByteCandidates(
  publicKey: string,
): PublicKeyByteCandidate[] {
  const normalizedHex = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;
  const candidates: PublicKeyByteCandidate[] = [];

  if (
    normalizedHex.length > 0 &&
    normalizedHex.length % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(normalizedHex)
  ) {
    candidates.push({ label: "hex", bytes: fromHex(normalizedHex) });
  }

  for (const [label, decode] of [
    ["base58", fromBase58],
    ["base64", fromBase64],
  ] as const) {
    try {
      candidates.push({ label, bytes: decode(publicKey) });
    } catch {
      // Try the next supported encoding before reporting a combined error.
    }
  }

  if (candidates.length === 0) {
    throw new Error("Invalid Sui public key: unsupported public key encoding");
  }

  return candidates;
}

function isSuiSignatureSchemeFlag(
  flag: number | undefined,
): flag is keyof typeof SIGNATURE_FLAG_TO_SCHEME {
  return flag !== undefined && flag in SIGNATURE_FLAG_TO_SCHEME;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asciiString(bytes: Uint8Array<ArrayBufferLike>): string | null {
  if (bytes.some((byte) => byte < 32 || byte > 126)) {
    return null;
  }

  return new TextDecoder().decode(bytes);
}
