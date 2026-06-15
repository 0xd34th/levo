import type { PublicKey } from "@mysten/sui/cryptography";
import { Signer, type SignatureScheme } from "@mysten/sui/cryptography";
import { postPrivySigningRequest } from "@/lib/privy/clientSigning";
import { decodeSuiPublicKey } from "@/lib/sui/publicKey";

export function decodeStoredSuiPublicKey(publicKey: string): PublicKey {
  return decodeSuiPublicKey(publicKey);
}

async function signSuiDigest(params: {
  sessionJwt: string;
  digest: Uint8Array;
  refreshSessionJwt?: (() => Promise<string | null>) | undefined;
}): Promise<Uint8Array<ArrayBuffer>> {
  const payload = await postPrivySigningRequest<{ signature: string }>({
    body: {
      digest: Buffer.from(params.digest).toString("hex"),
    },
    defaultErrorMessage: "Failed to sign Sui transaction",
    refreshSessionJwt: params.refreshSessionJwt,
    sessionJwt: params.sessionJwt,
    url: "/api/privy/sui/sign",
  });
  const signatureHex = payload.signature.startsWith("0x")
    ? payload.signature.slice(2)
    : payload.signature;

  return new Uint8Array(Buffer.from(signatureHex, "hex"));
}

export class PrivySuiSigner extends Signer {
  #publicKey: PublicKey;
  #refreshSessionJwt?: (() => Promise<string | null>) | undefined;
  #sessionJwt: string;

  constructor(params: {
    publicKey: string;
    refreshSessionJwt?: (() => Promise<string | null>) | undefined;
    sessionJwt: string;
  }) {
    super();
    this.#publicKey = decodeStoredSuiPublicKey(params.publicKey);
    this.#refreshSessionJwt = params.refreshSessionJwt;
    this.#sessionJwt = params.sessionJwt;
  }

  override async sign(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return signSuiDigest({
      digest: bytes,
      refreshSessionJwt: this.#refreshSessionJwt,
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
