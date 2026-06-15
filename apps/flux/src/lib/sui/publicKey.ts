import type { PublicKey } from "@mysten/sui/cryptography";
import { SIGNATURE_FLAG_TO_SCHEME } from "@mysten/sui/cryptography";
import { fromBase58, fromHex } from "@mysten/sui/utils";
import {
  publicKeyFromRawBytes,
  publicKeyFromSuiBytes,
} from "@mysten/sui/verify";

export type DecodeSuiPublicKeyOptions = NonNullable<
  Parameters<typeof publicKeyFromRawBytes>[2]
>;

export type SuiPublicKeyInput = ArrayLike<number> | string;

export function decodeSuiPublicKey(
  publicKey: SuiPublicKeyInput,
  options?: DecodeSuiPublicKeyOptions,
): PublicKey {
  const bytes = publicKeyBytes(publicKey);

  if (bytes.length === 32) {
    return publicKeyFromRawBytes("ED25519", bytes, options);
  }

  if (bytes.length === 33) {
    if (
      !SIGNATURE_FLAG_TO_SCHEME[
        bytes[0] as keyof typeof SIGNATURE_FLAG_TO_SCHEME
      ]
    ) {
      throw new Error(
        `Invalid Sui public key: unsupported signature scheme flag ${bytes[0]}`,
      );
    }

    return publicKeyFromSuiBytes(bytes, options);
  }

  throw new Error(
    `Invalid Sui public key: expected 32 raw bytes or 33 Sui bytes, received ${bytes.length} bytes`,
  );
}

function publicKeyBytes(publicKey: SuiPublicKeyInput): Uint8Array {
  if (typeof publicKey !== "string") {
    return new Uint8Array(publicKey);
  }

  const normalizedHex = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;

  try {
    if (
      normalizedHex.length > 0 &&
      normalizedHex.length % 2 === 0 &&
      /^[0-9a-fA-F]+$/.test(normalizedHex)
    ) {
      return fromHex(normalizedHex);
    }

    return fromBase58(publicKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Invalid Sui public key: ${message}`, {
      cause: error,
    });
  }
}
