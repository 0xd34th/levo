/**
 * Sui 差异化核心：PTB → 自然语言反编译.
 */
import { tool } from "ai";
import { z } from "zod";
import { getSuiClient } from "@/lib/sui/rpc";
import { explainTx, type ExplainedTx } from "@/lib/sui/ptb-explainer";
import { withCache, hashKey } from "@/lib/cache/store";

export const explainTxParams = z.object({
  digest: z.string().min(40).describe("Sui transaction digest."),
});

export type ExplainTxInput = z.infer<typeof explainTxParams>;

export async function runExplainTx(input: ExplainTxInput): Promise<ExplainedTx> {
  const key = hashKey(["explainTx", input.digest]);
  return withCache<ExplainedTx>(
    key,
    async () => {
      const client = getSuiClient();
      const tx = await client.getTransactionBlock({
        digest: input.digest,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
        },
      });
      return explainTx(tx);
    },
    { ttl: 86400, swr: 86400 * 7 }, // tx is immutable
  );
}

export const explainTxTool = tool({
  description:
    "Decompile a Sui Programmable Transaction Block into human language. Returns step list, balance changes, and a one-line summary.",
  inputSchema: explainTxParams,
  execute: runExplainTx,
});
