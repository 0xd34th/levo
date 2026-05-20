import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import { buildPrivyClientConfig } from "./privyConfig";

describe("buildPrivyClientConfig", () => {
  it("limits Privy to email and google identity verification only", () => {
    const config = buildPrivyClientConfig({
      defaultChain: mainnet,
      supportedChains: [mainnet],
    });

    expect(config.loginMethods).toEqual(["email", "google"]);
    expect(config.externalWallets).toMatchObject({
      disableAllExternalWallets: true,
    });
    expect(config.externalWallets).not.toHaveProperty("walletConnect");
    expect(config.appearance).toMatchObject({
      showWalletLoginFirst: false,
      walletChainType: "ethereum-and-solana",
    });
  });

  it("keeps embedded wallet provisioning and supported chain config intact", () => {
    const config = buildPrivyClientConfig({
      defaultChain: mainnet,
      supportedChains: [mainnet],
    });

    expect(config.defaultChain).toBe(mainnet);
    expect(config.supportedChains).toEqual([mainnet]);
    expect(config.embeddedWallets).toMatchObject({
      ethereum: {
        createOnLogin: "all-users",
      },
      showWalletUIs: false,
      solana: {
        createOnLogin: "all-users",
      },
    });
  });
});
