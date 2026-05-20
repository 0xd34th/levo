import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import type { BVAccountActivity } from "@/lib/blockvision/types";
import { resolveAddressOrName } from "@/lib/sui/names";

export const getRecentActivityParams = z.object({
  addressOrName: z.string().describe("0x address or .sui name."),
  limit: z.number().int().min(1).max(50).default(10),
});

export type GetRecentActivityInput = z.infer<typeof getRecentActivityParams>;

export type ActivitySource = "blockvision";

export interface RecentActivityResult {
  address: string;
  source: ActivitySource;
  count: number;
  activities: BVAccountActivity[];
}

export async function runGetRecentActivity(
  input: GetRecentActivityInput,
): Promise<RecentActivityResult> {
  const resolved = await resolveAddressOrName(input.addressOrName);
  if (!resolved) throw new Error(`Could not resolve: ${input.addressOrName}`);

  const data = await bvGet<{ data?: BVAccountActivity[]; items?: BVAccountActivity[] }>(
    "/account/activities",
    { account: resolved, pageSize: input.limit },
    { ttl: 30, swr: 60 },
  );
  const activities = data.items ?? data.data ?? [];

  return {
    address: resolved,
    source: "blockvision",
    count: activities.length,
    activities: activities.slice(0, input.limit),
  };
}

export const getRecentActivityTool = tool({
  description:
    "Fetch recent transactions for an address via BlockVision. Each item has a digest the user can ask to explain.",
  inputSchema: getRecentActivityParams,
  execute: runGetRecentActivity,
});
