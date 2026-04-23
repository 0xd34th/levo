import { LiFiErrorCode, ProviderError } from "@lifi/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initEccLibMock = vi.fn();
const signAllInputsAsyncMock = vi.fn();
const finalizeAllInputsMock = vi.fn();
const toHexMock = vi.fn();
const fromHexMock = vi.fn();

vi.mock("@bitcoinerlab/secp256k1", () => ({}));
vi.mock("bitcoinjs-lib", () => ({
  initEccLib: initEccLibMock,
  Psbt: {
    fromHex: fromHexMock,
  },
}));

describe("bitcoin Privy signing helpers", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
    signAllInputsAsyncMock.mockReset();
    finalizeAllInputsMock.mockReset();
    toHexMock.mockReset();
    fromHexMock.mockReset();

    fromHexMock.mockReturnValue({
      finalizeAllInputs: finalizeAllInputsMock,
      signAllInputsAsync: signAllInputsAsyncMock,
      toHex: toHexMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends only the bearer session JWT to the bitcoin signing route", async () => {
    const { signBitcoinPsbt } = await import("./bitcoin");

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ psbt: "signed-psbt" }), {
        status: 200,
      }),
    );

    await expect(
      signBitcoinPsbt({
        psbt: "unsigned-psbt",
        sessionJwt: "session-access-token",
      }),
    ).resolves.toBe("signed-psbt");

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      Authorization: "Bearer session-access-token",
      "Content-Type": "application/json",
    });
  });

  it("surfaces backend auth failures as provider errors", async () => {
    const { signBitcoinPsbt } = await import("./bitcoin");

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid or expired Privy session" }), {
        status: 401,
      }),
    );

    await expect(
      signBitcoinPsbt({
        psbt: "unsigned-psbt",
        sessionJwt: "expired-session-token",
      }),
    ).rejects.toMatchObject({
      code: LiFiErrorCode.ProviderUnavailable,
      message: "Invalid or expired Privy session",
      name: "ProviderError",
    });
  });

  it("passes the signer session JWT through to Privy rawSign", async () => {
    const { signPrivyBitcoinPsbt } = await import("./bitcoin");
    const rawSign = vi.fn().mockResolvedValue({
      signature: "0xbeef",
    });

    signAllInputsAsyncMock.mockImplementation(
      async ({ sign }: { sign: (hash: Uint8Array) => Promise<Uint8Array> }) => {
        await sign(new Uint8Array([0xde, 0xad]));
      },
    );
    toHexMock.mockReturnValue("signed-psbt-hex");

    await expect(
      signPrivyBitcoinPsbt({
        privy: {
          wallets: () => ({
            rawSign,
          }),
        },
        psbt: "unsigned-psbt",
        publicKey: "02abc123",
        sessionJwt: "session-access-token",
        walletId: "wallet-btc",
      }),
    ).resolves.toBe("signed-psbt-hex");

    expect(initEccLibMock).toHaveBeenCalledTimes(1);
    expect(fromHexMock).toHaveBeenCalledWith("unsigned-psbt");
    expect(rawSign).toHaveBeenCalledWith("wallet-btc", {
      authorization_context: {
        user_jwts: ["session-access-token"],
      },
      params: {
        hash: "0xdead",
      },
    });
    expect(finalizeAllInputsMock).toHaveBeenCalledTimes(1);
  });
});
