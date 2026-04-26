import { mainnet } from "viem/chains";
import { describe, expect, it } from "vitest";
import { buildPrivyClientConfig } from "./privyConfig";

describe("buildPrivyClientConfig", () => {
  it("enables wallet login without disabling external wallets", () => {
    const config = buildPrivyClientConfig({
      defaultChain: mainnet,
      supportedChains: [mainnet],
    });

    expect(config.loginMethods).toEqual(["email", "google", "wallet"]);
    expect(config.externalWallets).toMatchObject({
      disableAllExternalWallets: false,
      walletConnect: {
        enabled: true,
      },
    });
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
