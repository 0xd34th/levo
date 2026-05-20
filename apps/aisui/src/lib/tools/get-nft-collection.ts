import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import type { BVNftCollectionDetail } from "@/lib/blockvision/types";

export const getNftCollectionParams = z.object({
  collectionType: z
    .string()
    .describe("Sui NFT type (full Move type), e.g. 0x…::collection::Type"),
});

export type GetNftCollectionInput = z.infer<typeof getNftCollectionParams>;

export interface NftCollectionResult {
  collection: BVNftCollectionDetail;
  recentSales: Array<{
    objectId: string;
    name?: string;
    image?: string;
    price?: number;
    timestamp?: number;
  }>;
}

export async function runGetNftCollection(
  input: GetNftCollectionInput,
): Promise<NftCollectionResult> {
  const [detail, sales] = await Promise.all([
    bvGet<BVNftCollectionDetail>(
      "/nft/collectionDetail",
      { collectionType: input.collectionType },
      { ttl: 300, swr: 1200 },
    ),
    bvGet<SalesResp>(
      "/nft/sales",
      { collectionType: input.collectionType, pageSize: 8 },
      { ttl: 300, swr: 600 },
    ).catch<SalesResp>(() => ({ items: [] })),
  ]);
  return {
    collection: detail,
    recentSales: sales.items ?? sales.data ?? [],
  };
}

interface SaleItem {
  objectId: string;
  name?: string;
  image?: string;
  price?: number;
  timestamp?: number;
}
type SalesResp = { items?: SaleItem[]; data?: SaleItem[] };

export const getNftCollectionTool = tool({
  description: "Fetch NFT collection floor price, holders, sales for a Sui NFT type.",
  inputSchema: getNftCollectionParams,
  execute: runGetNftCollection,
});
