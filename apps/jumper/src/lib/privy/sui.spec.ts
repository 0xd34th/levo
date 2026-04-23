import { LiFiErrorCode, ProviderError } from "@lifi/sdk";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivySuiSigner } from "./sui";

describe("PrivySuiSigner", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends only the bearer session JWT to the Sui signing route", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ signature: "0xdeadbeef" }), {
        status: 200,
      }),
    );

    const keypair = new Ed25519Keypair();
    const signer = new PrivySuiSigner({
      publicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString(
        "hex",
      ),
      sessionJwt: "session-access-token",
    });

    await signer.sign(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

    expect(fetch).toHaveBeenCalledTimes(1);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      Authorization: "Bearer session-access-token",
      "Content-Type": "application/json",
    });
  });

  it("surfaces backend auth failures as provider errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid or expired Privy session" }), {
        status: 401,
      }),
    );

    const keypair = new Ed25519Keypair();
    const signer = new PrivySuiSigner({
      publicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString(
        "hex",
      ),
      sessionJwt: "expired-session-token",
    });

    await expect(
      signer.sign(new Uint8Array([0xde, 0xad])),
    ).rejects.toMatchObject({
      code: LiFiErrorCode.ProviderUnavailable,
      message: "Invalid or expired Privy session",
      name: "ProviderError",
    });
  });
});
