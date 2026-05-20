import { tool } from "ai";
import { z } from "zod";
import { resolveAddressOrName } from "@/lib/sui/names";
import { resolveCoinMetadata } from "@/lib/sui/coin-metadata";

const SUI_COIN = "0x2::sui::SUI";

export const prepareTransferParams = z.object({
  toAddressOrName: z.string().describe("Recipient: 0x address or .sui name."),
  coinType: z
    .string()
    .default(SUI_COIN)
    .describe("Coin type to send. Defaults to SUI."),
  amount: z.string().describe("Human-readable amount, e.g. '1.5'."),
});

export type PrepareTransferInput = z.infer<typeof prepareTransferParams>;

export interface PrepareTransferResult {
  recipient: string;
  recipientResolvedFrom?: string;
  coinType: string;
  symbol: string;
  decimals: number;
  amount: string;
  amountRaw: string;
  warnings: string[];
}

function toBaseUnits(amount: string, decimals: number): string {
  const cleaned = amount.trim().replace(/_/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Invalid amount: ${amount}`);
  const [intPart, fracPartRaw = ""] = cleaned.split(".");
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0");
  const combined = (intPart + fracPart).replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}

export async function runPrepareTransfer(
  input: PrepareTransferInput,
): Promise<PrepareTransferResult> {
  const recipient = await resolveAddressOrName(input.toAddressOrName);
  if (!recipient) {
    throw new Error(`Could not resolve recipient: ${input.toAddressOrName}`);
  }
  const coinType = input.coinType === "SUI" ? SUI_COIN : input.coinType;
  const meta = await resolveCoinMetadata(coinType);
  const decimals = meta.decimals ?? 9;
  const amountRaw = toBaseUnits(input.amount, decimals);

  const warnings: string[] = [];
  if (meta.scamFlag) warnings.push(`${meta.symbol} is flagged as suspicious.`);

  return {
    recipient,
    recipientResolvedFrom:
      input.toAddressOrName !== recipient ? input.toAddressOrName : undefined,
    coinType,
    symbol: meta.symbol ?? "?",
    decimals,
    amount: input.amount,
    amountRaw,
    warnings,
  };
}

export const prepareTransferTool = tool({
  description:
    "Validate a transfer request (SUI or any coin). Returns recipient + amount; wallet rebuilds the PTB at sign time.",
  inputSchema: prepareTransferParams,
  execute: runPrepareTransfer,
});
