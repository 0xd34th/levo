import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const privyEnvBackup = {
  NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
};

function buildUserFixture(userId = "privy-user-1") {
  return {
    id: userId,
    linked_accounts: [
      {
        address: "user@example.com",
        type: "email",
      },
      {
        address: "0x1234",
        chain_type: "ethereum",
        connector_type: "embedded",
        id: "wallet-evm",
        type: "wallet",
        wallet_client: "privy",
      },
      {
        address: "So11111111111111111111111111111111111111112",
        chain_type: "solana",
        connector_type: "embedded",
        id: "wallet-sol",
        public_key: "sol-public-key",
        type: "wallet",
        wallet_client: "privy",
      },
      {
        address: "0xsui",
        chain_type: "sui",
        connector_type: "embedded",
        id: "wallet-sui",
        public_key: "sui-public-key",
        type: "wallet",
        wallet_client: "privy",
      },
      {
        address: "bc1qexample",
        chain_type: "bitcoin-segwit",
        connector_type: "embedded",
        id: "wallet-btc",
        public_key: "bitcoin-public-key",
        type: "wallet",
        wallet_client: "privy",
      },
    ],
  };
}

async function loadServerModule(options?: {
  accessResult?: "success" | "invalid" | "error";
  identityResult?: "success" | "invalid" | "error";
  userId?: string;
}) {
  vi.resetModules();

  const user = buildUserFixture(options?.userId);

  class MockInvalidAuthTokenError extends Error {}

  const verifyAccessToken = vi.fn(async () => {
    switch (options?.accessResult) {
      case "invalid":
        throw new MockInvalidAuthTokenError("invalid access token");
      case "error":
        throw new Error("access verification unavailable");
      default:
        return { user_id: user.id };
    }
  });

  const verifyIdentityToken = vi.fn(async () => {
    switch (options?.identityResult) {
      case "invalid":
        throw new MockInvalidAuthTokenError("invalid identity token");
      case "error":
        throw new Error("identity verification unavailable");
      default:
        return user;
    }
  });

  const getUser = vi.fn(async (userId: string) => ({
    ...user,
    id: userId,
  }));

  const pregenerateWallets = vi.fn(async () => user);

  const privyClientInstance = {
    users: () => ({
      _get: getUser,
      pregenerateWallets,
    }),
    utils: () => ({
      auth: () => ({
        verifyAccessToken,
        verifyIdentityToken,
      }),
    }),
  };

  const PrivyClient = vi.fn(function MockPrivyClient() {
    return privyClientInstance;
  });

  vi.doMock("@privy-io/node", () => ({
    InvalidAuthTokenError: MockInvalidAuthTokenError,
    PrivyClient,
  }));

  const module = await import("./server");

  return {
    ...module,
    InvalidAuthTokenError: MockInvalidAuthTokenError,
    PrivyClient,
    getUser,
    pregenerateWallets,
    user,
    verifyAccessToken,
    verifyIdentityToken,
  };
}

describe("requirePrivySession", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy-app-id";
    process.env.PRIVY_APP_SECRET = "privy-app-secret";
  });

  afterEach(() => {
    if (privyEnvBackup.NEXT_PUBLIC_PRIVY_APP_ID === undefined) {
      delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    } else {
      process.env.NEXT_PUBLIC_PRIVY_APP_ID =
        privyEnvBackup.NEXT_PUBLIC_PRIVY_APP_ID;
    }

    if (privyEnvBackup.PRIVY_APP_SECRET === undefined) {
      delete process.env.PRIVY_APP_SECRET;
    } else {
      process.env.PRIVY_APP_SECRET = privyEnvBackup.PRIVY_APP_SECRET;
    }

    vi.restoreAllMocks();
  });

  it("accepts a valid access-token session for Sui signing requests", async () => {
    const {
      PrivyClient,
      getUser,
      pregenerateWallets,
      requirePrivySession,
      verifyAccessToken,
      verifyIdentityToken,
    } = await loadServerModule();

    const session = await requirePrivySession(
      new Request("http://localhost/api/privy/sui/sign", {
        headers: {
          Authorization: "Bearer access-token-jwt",
        },
      }),
    );

    expect("response" in session).toBe(false);
    if ("response" in session) {
      return;
    }

    expect(PrivyClient).toHaveBeenCalledWith({
      appId: "privy-app-id",
      appSecret: "privy-app-secret",
    });
    expect(verifyAccessToken).toHaveBeenCalledWith("access-token-jwt");
    expect(verifyIdentityToken).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith("privy-user-1");
    expect(pregenerateWallets).not.toHaveBeenCalled();
    expect(session.sessionJwt).toBe("access-token-jwt");
    expect(session.sessionJwtType).toBe("access");
    expect(session.walletFleet.wallets.sui?.walletId).toBe("wallet-sui");
  });

  it("accepts a valid access-token session for bitcoin signing requests", async () => {
    const {
      getUser,
      requirePrivySession,
      verifyAccessToken,
      verifyIdentityToken,
    } = await loadServerModule();

    const session = await requirePrivySession(
      new Request("http://localhost/api/privy/bitcoin/sign-psbt", {
        headers: {
          Authorization: "Bearer access-token-jwt",
        },
      }),
    );

    expect("response" in session).toBe(false);
    if ("response" in session) {
      return;
    }

    expect(verifyAccessToken).toHaveBeenCalledWith("access-token-jwt");
    expect(verifyIdentityToken).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith("privy-user-1");
    expect(session.sessionJwt).toBe("access-token-jwt");
    expect(session.walletFleet.wallets.bitcoin?.walletId).toBe("wallet-btc");
  });

  it("falls back to identity-token verification when access-token verification rejects as invalid", async () => {
    const {
      getUser,
      requirePrivySession,
      verifyAccessToken,
      verifyIdentityToken,
    } = await loadServerModule({
      accessResult: "invalid",
      userId: "privy-user-identity",
    });

    const session = await requirePrivySession(
      new Request("http://localhost/api/privy/sui/sign", {
        headers: {
          Authorization: "Bearer identity-token-jwt",
        },
      }),
    );

    expect("response" in session).toBe(false);
    if ("response" in session) {
      return;
    }

    expect(verifyAccessToken).toHaveBeenCalledWith("identity-token-jwt");
    expect(verifyIdentityToken).toHaveBeenCalledWith("identity-token-jwt");
    expect(getUser).toHaveBeenCalledWith("privy-user-identity");
    expect(session.sessionJwt).toBe("identity-token-jwt");
    expect(session.sessionJwtType).toBe("identity");
    expect(session.walletFleet.wallets.bitcoin?.walletId).toBe("wallet-btc");
  });

  it("returns 401 when both access-token and identity-token verification reject as invalid", async () => {
    const {
      getUser,
      requirePrivySession,
      verifyAccessToken,
      verifyIdentityToken,
    } = await loadServerModule({
      accessResult: "invalid",
      identityResult: "invalid",
    });

    const session = await requirePrivySession(
      new Request("http://localhost/api/privy/bitcoin/sign-psbt", {
        headers: {
          Authorization: "Bearer invalid-token-jwt",
        },
      }),
    );

    expect("response" in session).toBe(true);
    if (!("response" in session)) {
      return;
    }

    expect(verifyAccessToken).toHaveBeenCalledWith("invalid-token-jwt");
    expect(verifyIdentityToken).toHaveBeenCalledWith("invalid-token-jwt");
    expect(getUser).not.toHaveBeenCalled();
    expect(session.response.status).toBe(401);
    await expect(session.response.json()).resolves.toEqual({
      error: "Invalid or expired Privy session",
    });
  });
});
