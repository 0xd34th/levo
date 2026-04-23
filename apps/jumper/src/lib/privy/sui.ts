import { fromBase58, fromHex } from "@mysten/sui/utils";
import {
  publicKeyFromRawBytes,
  publicKeyFromSuiBytes,
} from "@mysten/sui/verify";
import type { PublicKey } from "@mysten/sui/cryptography";
import { Signer, type SignatureScheme } from "@mysten/sui/cryptography";
import { LiFiErrorCode, ProviderError } from "@lifi/sdk";

export function decodeStoredSuiPublicKey(publicKey: string): PublicKey {
  const normalizedHex = publicKey.startsWith("0x")
    ? publicKey.slice(2)
    : publicKey;

  if (normalizedHex.length > 0 && /^[0-9a-fA-F]+$/.test(normalizedHex)) {
    const bytes = fromHex(normalizedHex);

    if (bytes.length === 33) {
      return publicKeyFromSuiBytes(bytes);
    }

    if (bytes.length === 32) {
      return publicKeyFromRawBytes("ED25519", bytes);
    }
  }

  const rawBytes = fromBase58(publicKey);
  return publicKeyFromRawBytes("ED25519", rawBytes);
}

async function signSuiDigest(params: {
  sessionJwt: string;
  digest: Uint8Array;
}): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch("/api/privy/sui/sign", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.sessionJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      digest: Buffer.from(params.digest).toString("hex"),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new ProviderError(
      LiFiErrorCode.ProviderUnavailable,
      payload?.error || "Failed to sign Sui transaction",
    );
  }

  const payload = (await response.json()) as { signature: string };
  const signatureHex = payload.signature.startsWith("0x")
    ? payload.signature.slice(2)
    : payload.signature;

  return new Uint8Array(Buffer.from(signatureHex, "hex"));
}

export class PrivySuiSigner extends Signer {
  #publicKey: PublicKey;
  #sessionJwt: string;

  constructor(params: {
    publicKey: string;
    sessionJwt: string;
  }) {
    super();
    this.#publicKey = decodeStoredSuiPublicKey(params.publicKey);
    this.#sessionJwt = params.sessionJwt;
  }

  override async sign(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return signSuiDigest({
      digest: bytes,
      sessionJwt: this.#sessionJwt,
    });
  }

  override getPublicKey(): PublicKey {
    return this.#publicKey;
  }

  override getKeyScheme(): SignatureScheme {
    return "ED25519";
  }
}
