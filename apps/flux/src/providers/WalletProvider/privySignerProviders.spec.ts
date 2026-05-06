import { LiFiErrorCode, ProviderError } from "@lifi/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PrivySuiSignerMock = vi.fn(function MockPrivySuiSigner(params) {
  return { params };
});
const signBitcoinPsbtMock = vi.fn();
const suiBaseGetStepExecutorMock = vi.fn();
const bitcoinBaseGetStepExecutorMock = vi.fn();

vi.mock("@/lib/privy/sui", () => ({
  PrivySuiSigner: PrivySuiSignerMock,
}));
vi.mock("@/lib/privy/bitcoin", () => ({
  signBitcoinPsbt: signBitcoinPsbtMock,
}));
vi.mock("@lifi/sdk-provider-sui", () => ({
  SuiProvider: vi.fn((options) => ({
    getStepExecutor: (input: unknown) => suiBaseGetStepExecutorMock(options, input),
  })),
}));
vi.mock("@lifi/sdk-provider-bitcoin", () => ({
  BitcoinProvider: vi.fn((options) => ({
    getStepExecutor: (input: unknown) =>
      bitcoinBaseGetStepExecutorMock(options, input),
  })),
}));

describe("privy signer providers", () => {
  beforeEach(() => {
    PrivySuiSignerMock.mockClear();
    signBitcoinPsbtMock.mockReset();
    suiBaseGetStepExecutorMock.mockReset();
    bitcoinBaseGetStepExecutorMock.mockReset();
  });

  it("preflights the Sui signer session before execution and reuses it for getSigner", async () => {
    const { buildPrivySuiSdkProvider } = await import("./privySignerProviders");
    const resolveSignerSession = vi
      .fn()
      .mockResolvedValue({ sessionJwt: "session-access-token" });

    suiBaseGetStepExecutorMock.mockImplementation(
      async (
        options: {
          getSigner: () => Promise<unknown>;
        },
        input: unknown,
      ) => ({
        input,
        signer: await options.getSigner(),
      }),
    );

    const provider = buildPrivySuiSdkProvider({
      getClient: async () => ({ client: true }) as never,
      publicKey: "sui-public-key",
      resolveSignerSession,
    });

    const executor = await provider.getStepExecutor({
      routeId: "route-1",
    } as never);

    expect(resolveSignerSession).toHaveBeenCalledTimes(1);
    expect(PrivySuiSignerMock).toHaveBeenCalledWith({
      publicKey: "sui-public-key",
      refreshSessionJwt: expect.any(Function),
      sessionJwt: "session-access-token",
    });
    expect(executor).toMatchObject({
      input: {
        routeId: "route-1",
      },
      signer: {
        params: {
          publicKey: "sui-public-key",
          refreshSessionJwt: expect.any(Function),
          sessionJwt: "session-access-token",
        },
      },
    });
  });

  it("prevents Sui execution from reaching getSigner when the Privy session is unavailable", async () => {
    const { buildPrivySuiSdkProvider } = await import("./privySignerProviders");
    const resolveSignerSession = vi.fn().mockRejectedValue(
      new ProviderError(
        LiFiErrorCode.ProviderUnavailable,
        "Privy session unavailable. Please reconnect your wallet and try again.",
      ),
    );

    const provider = buildPrivySuiSdkProvider({
      getClient: async () => ({ client: true }) as never,
      publicKey: "sui-public-key",
      resolveSignerSession,
    });

    await expect(
      provider.getStepExecutor({
        routeId: "route-1",
      } as never),
    ).rejects.toMatchObject({
      code: LiFiErrorCode.ProviderUnavailable,
      message: "Privy session unavailable. Please reconnect your wallet and try again.",
      name: "ProviderError",
    });

    expect(suiBaseGetStepExecutorMock).not.toHaveBeenCalled();
    expect(PrivySuiSignerMock).not.toHaveBeenCalled();
  });

  it("preflights the bitcoin signer session before execution and reuses it for request signing", async () => {
    const { buildPrivyBitcoinSdkProvider } = await import(
      "./privySignerProviders"
    );
    const resolveSignerSession = vi
      .fn()
      .mockResolvedValue({ sessionJwt: "session-access-token" });

    bitcoinBaseGetStepExecutorMock.mockImplementation(
      async (
        options: {
          getWalletClient: () => Promise<{
            request: (request: { method: string; params: { psbt: string } }) => Promise<string>;
          }>;
        },
        input: unknown,
      ) => ({
        input,
        walletClient: await options.getWalletClient(),
      }),
    );
    signBitcoinPsbtMock.mockResolvedValue("signed-psbt");

    const provider = buildPrivyBitcoinSdkProvider({
      address: "bc1qexample",
      publicKey: "02abc123",
      resolveSignerSession,
    });

    const executor = (await provider.getStepExecutor({
      routeId: "route-1",
    } as never)) as unknown as {
      walletClient: {
        request: (request: {
          method: string;
          params: { psbt: string };
        }) => Promise<string>;
      };
    };

    await executor.walletClient.request({
      method: "signPsbt",
      params: { psbt: "unsigned-psbt" },
    });

    expect(resolveSignerSession).toHaveBeenCalledTimes(1);
    expect(signBitcoinPsbtMock).toHaveBeenCalledWith({
      psbt: "unsigned-psbt",
      refreshSessionJwt: expect.any(Function),
      sessionJwt: "session-access-token",
    });
  });
});
