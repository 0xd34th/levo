import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import { bvFallbackDecision } from "@/lib/blockvision/fallback";
import type { BVAccountActivity } from "@/lib/blockvision/types";
import { resolveAddressOrName } from "@/lib/sui/names";
import { getOkxSuiActivities } from "@/lib/okx/wallet";
import { okxFallbackEligible } from "./get-portfolio";

export const getRecentActivityParams = z.object({
  addressOrName: z.string().describe("0x address or .sui name."),
  limit: z.number().int().min(1).max(50).default(10),
});

export type GetRecentActivityInput = z.infer<typeof getRecentActivityParams>;

export type ActivitySource = "blockvision" | "okx";

export interface RecentActivityResult {
  address: string;
  source: ActivitySource;
  fallbackReason?: string;
  count: number;
  activities: BVAccountActivity[];
}

export async function runGetRecentActivity(
  input: GetRecentActivityInput,
): Promise<RecentActivityResult> {
  const resolved = await resolveAddressOrName(input.addressOrName);
  if (!resolved) throw new Error(`Could not resolve: ${input.addressOrName}`);

  let activities: BVAccountActivity[];
  let source: ActivitySource = "blockvision";
  let fallbackReason: string | undefined;
  try {
    const data = await bvGet<{ data?: BVAccountActivity[]; items?: BVAccountActivity[] }>(
      "/account/activities",
      { account: resolved, pageSize: input.limit },
      { ttl: 30, swr: 60 },
    );
    activities = data.items ?? data.data ?? [];
  } catch (err) {
    const decision = bvFallbackDecision(err);
    if (decision.ok && okxFallbackEligible()) {
      activities = await getOkxSuiActivities(resolved, { limit: input.limit });
      source = "okx";
      fallbackReason = decision.reason;
    } else {
      throw err;
    }
  }

  return {
    address: resolved,
    source,
    fallbackReason,
    count: activities.length,
    activities: activities.slice(0, input.limit),
  };
}

export const getRecentActivityTool = tool({
  description:
    "Fetch recent transactions for an address. Each item has a digest the user can ask to explain. Falls back to OKX Wallet API when BlockVision is rate-limited.",
  inputSchema: getRecentActivityParams,
  execute: runGetRecentActivity,
});
