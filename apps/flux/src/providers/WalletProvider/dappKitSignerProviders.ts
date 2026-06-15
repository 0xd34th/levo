import { SuiProvider as SuiSDKProvider } from "@lifi/sdk-provider-sui";
import type { DAppKit } from "@mysten/dapp-kit-react";
import type { PublicKey, SignatureScheme } from "@mysten/sui/cryptography";
import { SIGNATURE_FLAG_TO_SCHEME, Signer } from "@mysten/sui/cryptography";
import type { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import { decodeSuiPublicKey } from "@/lib/sui/publicKey";

export function buildDappKitSuiSdkProvider(params: {
  dAppKit: DAppKit;
  getClient: NonNullable<Parameters<typeof SuiSDKProvider>[0]>["getClient"];
}) {
  const signer = new DappKitCurrentAccountSigner(params.dAppKit);

  return SuiSDKProvider({
    getClient: params.getClient,
    getSigner: async () => signer,
  });
}

class DappKitCurrentAccountSigner extends Signer {
  #dAppKit: DAppKit;
  #publicKeyCache = new Map<string, PublicKey>();

  constructor(dAppKit: DAppKit) {
    super();
    this.#dAppKit = dAppKit;
  }

  override getKeyScheme(): SignatureScheme {
    return SIGNATURE_FLAG_TO_SCHEME[
      this.getPublicKey().flag() as keyof typeof SIGNATURE_FLAG_TO_SCHEME
    ];
  }

  override getPublicKey(): PublicKey {
    const { account } = this.#dAppKit.stores.$connection.get();

    if (!account) {
      throw new Error("No account is connected.");
    }

    const cachedPublicKey = this.#publicKeyCache.get(account.address);
    if (cachedPublicKey) {
      return cachedPublicKey;
    }

    const publicKey = decodeSuiPublicKey(account.publicKey, {
      address: account.address,
      client: this.#dAppKit.stores.$currentClient.get(),
    });

    this.#publicKeyCache.set(account.address, publicKey);
    return publicKey;
  }

  override sign(_data: Uint8Array): never {
    throw new Error(
      "DappKitCurrentAccountSigner does not support signing directly. Use `signTransaction` or `signPersonalMessage` instead.",
    );
  }

  override async signTransaction(bytes: Uint8Array) {
    return this.#dAppKit.signTransaction({
      transaction: toBase64(bytes),
    });
  }

  override async signPersonalMessage(bytes: Uint8Array) {
    return this.#dAppKit.signPersonalMessage({
      message: bytes,
    });
  }

  override async signAndExecuteTransaction({
    transaction,
  }: {
    transaction: Transaction;
  }) {
    return this.#dAppKit.signAndExecuteTransaction({
      transaction,
    });
  }
}
