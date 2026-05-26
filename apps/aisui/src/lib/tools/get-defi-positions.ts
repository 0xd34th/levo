import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import { bvFallbackDecision } from "@/lib/blockvision/fallback";
import type { BVDefiPosition } from "@/lib/blockvision/types";
import { resolveAddressOrName } from "@/lib/sui/names";

export const getDefiPositionsParams = z.object({
  addressOrName: z.string().describe("0x address or .sui name."),
  protocol: z
    .string()
    .optional()
    .describe("Optional protocol filter, e.g. 'cetus', 'navi', 'scallop'."),
});

export type GetDefiPositionsInput = z.infer<typeof getDefiPositionsParams>;

export interface DefiPositionsResult {
  address: string;
  protocol?: string;
  totalValueUsd: number;
  positions: BVDefiPosition[];
  protocols: number;
  /** True when BV failed and no DeFi data could be resolved. */
  unavailable?: boolean;
  unavailableReason?: string;
}

export async function runGetDefiPositions(
  input: GetDefiPositionsInput,
): Promise<DefiPositionsResult> {
  const resolved = await resolveAddressOrName(input.addressOrName);
  if (!resolved) throw new Error(`Could not resolve: ${input.addressOrName}`);

  // BV is the only DeFi data source wired right now. On BV failure, degrade
  // to an empty payload with `unavailable: true` so the LLM can tell the user
  // honestly instead of throwing.
  try {
    const protocol = input.protocol ?? "cetus";
    const data = await bvGet<{ protocols?: BVDefiPosition[]; data?: BVDefiPosition[] }>(
      "/account/defiPortfolio",
      { address: resolved, protocol },
      { ttl: 60, swr: 180 },
    );
    const positions = data.protocols ?? data.data ?? [];
    const totalValueUsd = positions.reduce(
      (sum, p) => sum + p.positions.reduce((s, pos) => s + (pos.valueUsd ?? 0), 0),
      0,
    );
    return {
      address: resolved,
      protocol,
      totalValueUsd,
      positions,
      protocols: positions.length,
    };
  } catch (err) {
    const decision = bvFallbackDecision(err);
    if (decision.ok) {
      return {
        address: resolved,
        protocol: input.protocol ?? "cetus",
        totalValueUsd: 0,
        positions: [],
        protocols: 0,
        unavailable: true,
        unavailableReason: decision.reason,
      };
    }
    throw err;
  }
}

export const getDefiPositionsTool = tool({
  description:
    "Fetch DeFi positions (LP / lending / staking) for an address across 27+ Sui protocols. Always returns a valid result; check `unavailable` to see if the indexer was reachable.",
  inputSchema: getDefiPositionsParams,
  execute: runGetDefiPositions,
});
