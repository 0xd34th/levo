import { describe, expect, it } from "vitest";
import { explainTx } from "@/lib/sui/ptb-explainer";
import type { SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc";

const SAMPLE: SuiTransactionBlockResponse = {
  digest: "11111111111111111111111111111111111111111111",
  timestampMs: "1700000000000",
  transaction: {
    data: {
      messageVersion: "v1",
      sender: "0xa11ce",
      gasData: { payment: [], owner: "0xa11ce", price: "1000", budget: "1000000" },
      transaction: {
        kind: "ProgrammableTransaction",
        inputs: [],
        transactions: [
          { SplitCoins: ["GasCoin", [{ Input: 0 }]] },
          {
            MoveCall: {
              package: "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb",
              module: "router",
              function: "swap_exact_input",
              type_arguments: [],
              arguments: [],
            },
          },
        ],
      },
    },
    txSignatures: [],
  },
  effects: {
    messageVersion: "v1",
    status: { status: "success" },
    executedEpoch: "0",
    gasUsed: { computationCost: "1000", storageCost: "10000", storageRebate: "100", nonRefundableStorageFee: "0" },
    transactionDigest: "11111111111111111111111111111111111111111111",
    gasObject: { owner: { AddressOwner: "0xa11ce" }, reference: { objectId: "0x0", version: "0", digest: "0" } },
  } as unknown as SuiTransactionBlockResponse["effects"],
  balanceChanges: [
    { owner: { AddressOwner: "0xa11ce" }, coinType: "0x2::sui::SUI", amount: "-1000000000" },
    {
      owner: { AddressOwner: "0xa11ce" },
      coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
      amount: "4200000",
    },
  ],
  objectChanges: [],
};

describe("explainTx", () => {
  it("recognises a swap PTB and produces a human summary", () => {
    const out = explainTx(SAMPLE);
    expect(out.status).toBe("success");
    expect(out.steps).toHaveLength(2);
    expect(out.steps[1].kind).toBe("MoveCall");
    expect(out.summary.toLowerCase()).toContain("swap");
    expect(out.balanceChanges.find((c) => c.symbol === "SUI")?.direction).toBe("out");
    expect(out.balanceChanges.find((c) => c.symbol === "USDC")?.direction).toBe("in");
  });
});
