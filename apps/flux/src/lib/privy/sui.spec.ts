import { LiFiErrorCode } from "@lifi/sdk";
import { toBase64 } from "@mysten/sui/utils";
import {
  publicKeyFromSuiBytes,
  verifyTransactionSignature,
} from "@mysten/sui/verify";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeStoredSuiPublicKey, PrivySuiSigner } from "./sui";

describe("decodeStoredSuiPublicKey", () => {
  it("decodes raw 32-byte Ed25519 public keys", () => {
    const keypair = new Ed25519Keypair();
    const publicKey = decodeStoredSuiPublicKey(
      Buffer.from(keypair.getPublicKey().toRawBytes()).toString("hex"),
    );

    expect(publicKey.toSuiAddress()).toBe(
      keypair.getPublicKey().toSuiAddress(),
    );
  });

  it("decodes 33-byte Sui public keys with a signature scheme flag", () => {
    const keypair = new Ed25519Keypair();
    const suiPublicKey = Uint8Array.from([
      keypair.getPublicKey().flag(),
      ...keypair.getPublicKey().toRawBytes(),
    ]);
    const publicKey = decodeStoredSuiPublicKey(
      Buffer.from(suiPublicKey).toString("hex"),
    );

    expect(publicKey.toSuiAddress()).toBe(
      publicKeyFromSuiBytes(suiPublicKey).toSuiAddress(),
    );
  });

  it("throws an explicit local error for malformed public keys", () => {
    expect(() => decodeStoredSuiPublicKey("not a sui public key")).toThrow(
      "Invalid Sui public key",
    );
  });
});

describe("PrivySuiSigner", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the bearer session JWT to the Sui signing route", async () => {
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
    expect(JSON.parse(String(init.body))).toEqual({ digest: "deadbeef" });
  });

  it("surfaces backend auth failures as provider errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Invalid or expired Privy session" }),
        {
          status: 401,
        },
      ),
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

  it("retries once with a fresh session JWT when Privy rejects the cached token", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid JWT token provided" }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signature: "0xdeadbeef" }), {
          status: 200,
        }),
      );

    const refreshSessionJwt = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("fresh-session-access-token");
    const keypair = new Ed25519Keypair();
    const signer = new PrivySuiSigner({
      publicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString(
        "hex",
      ),
      refreshSessionJwt,
      sessionJwt: "stale-session-access-token",
    });

    await expect(signer.sign(new Uint8Array([0xde, 0xad]))).resolves.toEqual(
      new Uint8Array(Buffer.from("deadbeef", "hex")),
    );

    expect(refreshSessionJwt).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer fresh-session-access-token",
        "Content-Type": "application/json",
      },
    });
  });

  it("serializes backend raw transaction signatures into verifiable Sui signatures", async () => {
    const keypair = new Ed25519Keypair();
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { digest: string };
      const signature = await keypair.sign(
        new Uint8Array(Buffer.from(body.digest, "hex")),
      );

      return new Response(
        JSON.stringify({
          signature: `0x${Buffer.from(signature).toString("hex")}`,
        }),
        { status: 200 },
      );
    });

    const transactionBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const signer = new PrivySuiSigner({
      publicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString(
        "hex",
      ),
      sessionJwt: "session-access-token",
    });

    const signedTransaction = await signer.signTransaction(transactionBytes);

    expect(signedTransaction.bytes).toBe(toBase64(transactionBytes));
    await expect(
      verifyTransactionSignature(
        transactionBytes,
        signedTransaction.signature,
        {
          address: keypair.getPublicKey().toSuiAddress(),
        },
      ),
    ).resolves.toMatchObject({
      toSuiAddress: expect.any(Function),
    });
  });
});
