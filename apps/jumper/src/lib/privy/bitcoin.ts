import * as ecc from "@bitcoinerlab/secp256k1";
import { initEccLib, Psbt } from "bitcoinjs-lib";
import { PRIVY_IDENTITY_TOKEN_HEADER } from "./constants";

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

export async function signBitcoinPsbt(params: {
  identityToken: string;
  psbt: string;
  sessionJwt: string;
}): Promise<string> {
  const response = await fetch("/api/privy/bitcoin/sign-psbt", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.sessionJwt}`,
      "Content-Type": "application/json",
      [PRIVY_IDENTITY_TOKEN_HEADER]: params.identityToken,
    },
    body: JSON.stringify({
      psbt: params.psbt,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to sign bitcoin transaction");
  }

  const payload = (await response.json()) as { psbt: string };
  return payload.psbt;
}

export async function signPrivyBitcoinPsbt(params: {
  privy: {
    wallets(): {
      rawSign: (
        walletId: string,
        input: {
          authorization_context: { user_jwts: string[] };
          params: { hash: `0x${string}` };
        },
      ) => Promise<{ signature: string }>;
    };
  };
  psbt: string;
  publicKey: string;
  identityToken: string;
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
          user_jwts: [params.identityToken],
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
