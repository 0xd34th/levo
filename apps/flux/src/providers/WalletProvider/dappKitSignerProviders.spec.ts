import { describe, expect, it, vi } from "vitest";

const { CurrentAccountSignerMock, suiSDKProviderSpy } = vi.hoisted(() => ({
  CurrentAccountSignerMock: vi.fn(function MockSigner(this: {
    dAppKit: unknown;
  }, dAppKit: unknown) {
    this.dAppKit = dAppKit;
  }),
  suiSDKProviderSpy: vi.fn(),
}));

vi.mock("@mysten/dapp-kit-react", () => ({
  CurrentAccountSigner: CurrentAccountSignerMock,
}));

vi.mock("@lifi/sdk-provider-sui", () => ({
  SuiProvider: (options: { getClient: unknown; getSigner: unknown }) => {
    suiSDKProviderSpy(options);
    return { __isMockSdkProvider: true, ...options };
  },
}));

const { buildDappKitSuiSdkProvider } = await import("./dappKitSignerProviders");

describe("buildDappKitSuiSdkProvider", () => {
  it("forwards getClient and exposes a CurrentAccountSigner via getSigner", async () => {
    const fakeClient = { __id: "sui-client" };
    const fakeDAppKit = { __id: "dapp-kit-instance" };
    const getClient = vi.fn().mockResolvedValue(fakeClient);

    const provider = buildDappKitSuiSdkProvider({
      dAppKit: fakeDAppKit as never,
      getClient: getClient as never,
    });

    expect(suiSDKProviderSpy).toHaveBeenCalledTimes(1);
    expect(suiSDKProviderSpy.mock.calls[0][0].getClient).toBe(getClient);

    const passedGetSigner = suiSDKProviderSpy.mock.calls[0][0].getSigner as () => Promise<{
      dAppKit: unknown;
    }>;
    const signer = await passedGetSigner();

    expect(CurrentAccountSignerMock).toHaveBeenCalledWith(fakeDAppKit);
    expect(signer.dAppKit).toBe(fakeDAppKit);

    expect((provider as { __isMockSdkProvider?: boolean }).__isMockSdkProvider).toBe(true);
  });
});
