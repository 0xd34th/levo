import * as ecc from "@bitcoinerlab/secp256k1";
import { initEccLib, Psbt } from "bitcoinjs-lib";
import { postPrivySigningRequest } from "@/lib/privy/clientSigning";

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export async function signBitcoinPsbt(params: {
  psbt: string;
  refreshSessionJwt?: (() => Promise<string | null>) | undefined;
  sessionJwt: string;
}): Promise<string> {
  const payload = await postPrivySigningRequest<{ psbt: string }>({
    body: {
      psbt: params.psbt,
    },
    defaultErrorMessage: "Failed to sign bitcoin transaction",
    refreshSessionJwt: params.refreshSessionJwt,
    sessionJwt: params.sessionJwt,
    url: "/api/privy/bitcoin/sign-psbt",
  });

  return payload.psbt;
}

export async function signPrivyBitcoinPsbt(params: {
  authorizationPrivateKey: string;
  privy: {
    wallets(): {
      rawSign: (
        walletId: string,
        input: {
          authorization_context: { authorization_private_keys: string[] };
          params: { hash: `0x${string}` };
        },
      ) => Promise<{ signature: string }>;
    };
  };
  psbt: string;
  publicKey: string;
  walletId: string;
}): Promise<string> {
  initEccLib(ecc);

  const publicKey = new Uint8Array(
    Buffer.from(normalizeHex(params.publicKey), "hex"),
  );
  const psbt = Psbt.fromHex(params.psbt);

  await psbt.signAllInputsAsync({
    publicKey,
    async sign(hash) {
      const digestHex = Buffer.from(hash).toString("hex");
      const result = await params.privy.wallets().rawSign(params.walletId, {
        authorization_context: {
          authorization_private_keys: [params.authorizationPrivateKey],
        },
        params: {
          hash: `0x${digestHex}`,
        },
      });
      return new Uint8Array(Buffer.from(normalizeHex(result.signature), "hex"));
    },
  });

  psbt.finalizeAllInputs();
  return psbt.toHex();
}
