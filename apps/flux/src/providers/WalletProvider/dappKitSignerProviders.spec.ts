import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { toBase64 } from "@mysten/sui/utils";
import { describe, expect, it, vi } from "vitest";

const { suiSDKProviderSpy } = vi.hoisted(() => ({
  suiSDKProviderSpy: vi.fn(),
}));

vi.mock("@lifi/sdk-provider-sui", () => ({
  SuiProvider: (options: { getClient: unknown; getSigner: unknown }) => {
    suiSDKProviderSpy(options);
    return { __isMockSdkProvider: true, ...options };
  },
}));

const { buildDappKitSuiSdkProvider } = await import("./dappKitSignerProviders");

describe("buildDappKitSuiSdkProvider", () => {
  it("forwards getClient and exposes a signer via getSigner", async () => {
    const fakeClient = { __id: "sui-client" };
    const keypair = new Ed25519Keypair();
    const fakeDAppKit = createFakeDAppKit({
      account: {
        address: keypair.getPublicKey().toSuiAddress(),
        publicKey: keypair.getPublicKey().toRawBytes(),
      },
    });
    const getClient = vi.fn().mockResolvedValue(fakeClient);

    const provider = buildDappKitSuiSdkProvider({
      dAppKit: fakeDAppKit as never,
      getClient: getClient as never,
    });

    expect(suiSDKProviderSpy).toHaveBeenCalledTimes(1);
    expect(suiSDKProviderSpy.mock.calls[0][0].getClient).toBe(getClient);

    const passedGetSigner = suiSDKProviderSpy.mock.calls[0][0]
      .getSigner as () => Promise<{
      toSuiAddress: () => string;
    }>;
    const signer = await passedGetSigner();

    expect(signer.toSuiAddress()).toBe(keypair.getPublicKey().toSuiAddress());

    expect(
      (provider as { __isMockSdkProvider?: boolean }).__isMockSdkProvider,
    ).toBe(true);
  });

  it("decodes raw 32-byte external wallet public keys without throwing", async () => {
    const keypair = new Ed25519Keypair();
    const provider = buildDappKitSuiSdkProvider({
      dAppKit: createFakeDAppKit({
        account: {
          address: keypair.getPublicKey().toSuiAddress(),
          publicKey: keypair.getPublicKey().toRawBytes(),
        },
      }) as never,
      getClient: vi.fn() as never,
    }) as unknown as {
      getSigner: () => Promise<{ toSuiAddress: () => string }>;
    };

    const signer = await provider.getSigner();

    expect(signer.toSuiAddress()).toBe(keypair.getPublicKey().toSuiAddress());
  });

  it("decodes encoded external wallet public keys provided as bytes", async () => {
    const keypair = new Ed25519Keypair();
    const provider = buildDappKitSuiSdkProvider({
      dAppKit: createFakeDAppKit({
        account: {
          address: keypair.getPublicKey().toSuiAddress(),
          publicKey: new TextEncoder().encode(
            keypair.getPublicKey().toSuiPublicKey(),
          ),
        },
      }) as never,
      getClient: vi.fn() as never,
    }) as unknown as {
      getSigner: () => Promise<{ toSuiAddress: () => string }>;
    };

    const signer = await provider.getSigner();

    expect(signer.toSuiAddress()).toBe(keypair.getPublicKey().toSuiAddress());
  });

  it("delegates signTransaction to dapp-kit and returns the wallet result", async () => {
    const signedTransaction = {
      bytes: "signed-transaction-bytes",
      signature: "wallet-signature",
    };
    const signTransaction = vi.fn().mockResolvedValue(signedTransaction);
    const transactionBytes = new Uint8Array([1, 2, 3]);
    const provider = buildDappKitSuiSdkProvider({
      dAppKit: createFakeDAppKit({ signTransaction }) as never,
      getClient: vi.fn() as never,
    }) as unknown as {
      getSigner: () => Promise<{
        signTransaction: (
          bytes: Uint8Array,
        ) => Promise<typeof signedTransaction>;
      }>;
    };

    const signer = await provider.getSigner();
    const result = await signer.signTransaction(transactionBytes);

    expect(signTransaction).toHaveBeenCalledWith({
      transaction: toBase64(transactionBytes),
    });
    expect(result).toBe(signedTransaction);
  });
});

function createFakeDAppKit({
  account,
  signTransaction = vi.fn(),
}: {
  account?: { address: string; publicKey: Uint8Array };
  signTransaction?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    signAndExecuteTransaction: vi.fn(),
    signPersonalMessage: vi.fn(),
    signTransaction,
    stores: {
      $connection: {
        get: () => ({
          account: account ?? {
            address: "0x0",
            publicKey: new Uint8Array(32),
          },
        }),
      },
      $currentClient: {
        get: () => ({ __id: "current-client" }),
      },
    },
  };
}
