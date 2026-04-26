import { SuiProvider as SuiSDKProvider } from "@lifi/sdk-provider-sui";
import {
  CurrentAccountSigner,
  type DAppKit,
} from "@mysten/dapp-kit-react";

export function buildDappKitSuiSdkProvider(params: {
  dAppKit: DAppKit;
  getClient: NonNullable<Parameters<typeof SuiSDKProvider>[0]>["getClient"];
}) {
  const signer = new CurrentAccountSigner(params.dAppKit);

  return SuiSDKProvider({
    getClient: params.getClient,
    getSigner: async () => signer,
  });
}
