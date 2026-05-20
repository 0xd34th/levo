import { LiFiErrorCode, ProviderError } from "@lifi/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("resolvePrivySignerSession", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the Privy access token as the signer session JWT", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("session-access-token");
    const { resolvePrivySignerSession } = await import(
      "./resolvePrivySignerSession"
    );

    await expect(
      resolvePrivySignerSession({
        getAccessToken,
      }),
    ).resolves.toEqual({
      sessionJwt: "session-access-token",
    });

    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("fails fast when the Privy session token is missing", async () => {
    const getAccessToken = vi.fn().mockResolvedValue(null);
    const { resolvePrivySignerSession } = await import(
      "./resolvePrivySignerSession"
    );

    await expect(
      resolvePrivySignerSession({
        getAccessToken,
      }),
    ).rejects.toThrow("Missing Privy session token");
  });

  it("converts missing access tokens into a structured execution auth error", async () => {
    const getAccessToken = vi.fn().mockResolvedValue(null);
    const { resolvePrivyExecutionSignerSession } = await import(
      "./resolvePrivySignerSession"
    );

    await expect(
      resolvePrivyExecutionSignerSession({
        getAccessToken,
      }),
    ).rejects.toMatchObject({
      code: LiFiErrorCode.ProviderUnavailable,
      message: "Privy session unavailable. Please reconnect your wallet and try again.",
      name: "ProviderError",
    });
  });
});
