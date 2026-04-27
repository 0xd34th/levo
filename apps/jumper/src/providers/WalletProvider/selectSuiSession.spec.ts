import { ChainId, ChainType } from "@lifi/sdk";
import type { Account, WalletConnector } from "@lifi/widget-provider";
import { describe, expect, it } from "vitest";
import {
  dappKitSuiConnector,
  selectSuiAccount,
  selectSuiProviderTag,
} from "./selectSuiSession";

const privyConnector: WalletConnector = {
  icon: "/favicon.png",
  id: "privy-account",
  name: "Privy Account",
};

const disconnectedAccount: Account = {
  chainType: ChainType.MVM,
  isConnected: false,
  isConnecting: false,
  isDisconnected: true,
  isReconnecting: false,
  status: "disconnected",
};

describe("selectSuiProviderTag", () => {
  it("returns 'dapp-kit' when an external Sui account is connected", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: { address: "0xext" },
        suiWallet: { publicKey: "pk" },
      }),
    ).toBe("dapp-kit");
  });

  it("returns 'privy' when only a Privy embedded Sui wallet is available", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: null,
        suiWallet: { publicKey: "pk" },
      }),
    ).toBe("privy");
  });

  it("returns 'empty' when neither source is available", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: null,
        suiWallet: null,
      }),
    ).toBe("empty");
  });

  it("treats a Privy wallet without publicKey as missing", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: undefined,
        suiWallet: { publicKey: null },
      }),
    ).toBe("empty");
  });

  it("respects 'privy' preference when both sources are available", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: { address: "0xext" },
        suiWallet: { publicKey: "pk" },
        preference: "privy",
      }),
    ).toBe("privy");
  });

  it("falls back to external when 'privy' preference is set but no Privy session", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: { address: "0xext" },
        suiWallet: null,
        preference: "privy",
      }),
    ).toBe("dapp-kit");
  });

  it("treats 'external' preference as equivalent to 'auto' (external-first)", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: { address: "0xext" },
        suiWallet: { publicKey: "pk" },
        preference: "external",
      }),
    ).toBe("dapp-kit");
  });

  it("treats 'auto' preference as default (external-first)", () => {
    expect(
      selectSuiProviderTag({
        externalAccount: { address: "0xext" },
        suiWallet: { publicKey: "pk" },
        preference: "auto",
      }),
    ).toBe("dapp-kit");
  });
});

describe("selectSuiAccount", () => {
  it("prefers the external Sui wallet over the Privy embedded wallet", () => {
    const account = selectSuiAccount({
      authenticated: true,
      disconnectedAccount,
      externalAccount: { address: "0xext" },
      privyConnector,
      ready: true,
      suiWallet: { address: "0xprivy", publicKey: "pk" },
    });

    expect(account.address).toBe("0xext");
    expect(account.chainId).toBe(ChainId.SUI);
    expect(account.chainType).toBe(ChainType.MVM);
    expect(account.connector).toEqual(dappKitSuiConnector);
    expect(account.status).toBe("connected");
  });

  it("returns the Privy embedded address when preference is 'privy'", () => {
    const account = selectSuiAccount({
      authenticated: true,
      disconnectedAccount,
      externalAccount: { address: "0xext" },
      preference: "privy",
      privyConnector,
      ready: true,
      suiWallet: { address: "0xprivy", publicKey: "pk" },
    });

    expect(account.address).toBe("0xprivy");
    expect(account.connector).toEqual(privyConnector);
    expect(account.status).toBe("connected");
  });

  it("falls back to the Privy embedded Sui wallet when no external account exists", () => {
    const account = selectSuiAccount({
      authenticated: true,
      disconnectedAccount,
      externalAccount: null,
      privyConnector,
      ready: true,
      suiWallet: { address: "0xprivy", publicKey: "pk" },
    });

    expect(account.address).toBe("0xprivy");
    expect(account.connector).toEqual(privyConnector);
    expect(account.status).toBe("connected");
  });

  it("returns the disconnected account when nothing is available", () => {
    const account = selectSuiAccount({
      authenticated: false,
      disconnectedAccount,
      externalAccount: null,
      privyConnector,
      ready: true,
      suiWallet: null,
    });

    expect(account.isDisconnected).toBe(true);
    expect(account.status).toBe("disconnected");
  });

  it("returns the disconnected account when Privy is not yet ready", () => {
    const account = selectSuiAccount({
      authenticated: true,
      disconnectedAccount,
      externalAccount: null,
      privyConnector,
      ready: false,
      suiWallet: { address: "0xprivy", publicKey: "pk" },
    });

    expect(account.isDisconnected).toBe(true);
  });
});
