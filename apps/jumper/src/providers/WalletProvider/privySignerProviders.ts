import { signBitcoinPsbt } from "@/lib/privy/bitcoin";
import { PrivySuiSigner } from "@/lib/privy/sui";
import { BitcoinProvider as BitcoinSDKProvider } from "@lifi/sdk-provider-bitcoin";
import { SuiProvider as SuiSDKProvider } from "@lifi/sdk-provider-sui";

type ResolvePrivySignerSession = () => Promise<{
  sessionJwt: string;
}>;

export function buildPrivySuiSdkProvider(params: {
  getClient: NonNullable<Parameters<typeof SuiSDKProvider>[0]>["getClient"];
  publicKey: string;
  resolveSignerSession: ResolvePrivySignerSession;
}) {
  let preflightSessionJwt: string | null = null;

  const baseProvider = SuiSDKProvider({
    getClient: params.getClient,
    getSigner: async () => {
      const sessionJwt =
        preflightSessionJwt ??
        (await params.resolveSignerSession()).sessionJwt;

      return new PrivySuiSigner({
        publicKey: params.publicKey,
        sessionJwt,
      });
    },
  });

  return {
    ...baseProvider,
    async getStepExecutor(
      options: Parameters<typeof baseProvider.getStepExecutor>[0],
    ) {
      const signerSession = await params.resolveSignerSession();
      preflightSessionJwt = signerSession.sessionJwt;

      try {
        return await baseProvider.getStepExecutor(options);
      } finally {
        preflightSessionJwt = null;
      }
    },
  };
}

export function buildPrivyBitcoinSdkProvider(params: {
  address: string;
  publicKey: string;
  resolveSignerSession: ResolvePrivySignerSession;
}) {
  let preflightSessionJwt: string | null = null;

  const baseProvider = BitcoinSDKProvider({
    getWalletClient: async () => {
      const sessionJwt =
        preflightSessionJwt ??
        (await params.resolveSignerSession()).sessionJwt;

      return {
        account: {
          address: params.address,
          publicKey: params.publicKey.startsWith("0x")
            ? params.publicKey
            : `0x${params.publicKey}`,
        },
        async request(request: {
          method: string;
          params: { psbt: string };
        }) {
          if (request.method !== "signPsbt") {
            throw new Error(
              `Unsupported bitcoin wallet method: ${request.method}`,
            );
          }

          return signBitcoinPsbt({
            psbt: request.params.psbt,
            sessionJwt,
          });
        },
      } as never;
    },
  });

  return {
    ...baseProvider,
    async getStepExecutor(
      options: Parameters<typeof baseProvider.getStepExecutor>[0],
    ) {
      const signerSession = await params.resolveSignerSession();
      preflightSessionJwt = signerSession.sessionJwt;

      try {
        return await baseProvider.getStepExecutor(options);
      } finally {
        preflightSessionJwt = null;
      }
    },
  };
}
