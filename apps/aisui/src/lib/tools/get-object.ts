/**
 * Sui-differentiated tool: resolve any object's type / owner / dynamic
 * fields / display.
 *
 * Two robustness layers added after live testing:
 *  1. `normaliseObjectId` pads short ids ("0x6") to the full 32-byte form so
 *     the RPC doesn't 404. Sui RPC is strict about address length.
 *  2. If the primary RPC (often a rate-limited gateway like BlockVision)
 *     fails, retry against the always-on Mysten public fullnode. Every other
 *     fallback path in the app does the same — keeping `get_object` aligned.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { getSuiClient, getPublicSuiClient, normaliseObjectId } from "@/lib/sui/rpc";
import { withCache, hashKey } from "@/lib/cache/store";

export const getObjectParams = z.object({
  objectId: z.string().describe("0x… Sui object id. Short ids like 0x6 are accepted."),
  showDynamicFields: z.boolean().default(true),
});

export type GetObjectInput = z.infer<typeof getObjectParams>;

export interface ObjectResult {
  objectId: string;
  exists: boolean;
  version?: string;
  digest?: string;
  type?: string | null;
  owner?: string;
  ownerKind?: "AddressOwner" | "ObjectOwner" | "Shared" | "Immutable" | "Unknown";
  display?: Record<string, string>;
  fields?: Record<string, unknown>;
  bcsHex?: string;
  dynamicFields?: Array<{
    name: unknown;
    type: string;
    objectId: string;
    objectType: string;
  }>;
  storageRebate?: string | null;
  description?: string;
  /** Which RPC actually served the response. */
  rpcSource?: "primary" | "public-fallback";
}

async function fetchObjectViaClient(
  client: SuiJsonRpcClient,
  objectId: string,
  includeDynamic: boolean,
) {
  const obj = await client.getObject({
    id: objectId,
    options: {
      showType: true,
      showOwner: true,
      showContent: true,
      showDisplay: true,
      showStorageRebate: true,
    },
  });
  let dynamicFields: ObjectResult["dynamicFields"] | undefined;
  if (includeDynamic && obj.data) {
    try {
      const dfRes = await client.getDynamicFields({ parentId: objectId });
      dynamicFields = dfRes.data.map((f) => ({
        name: f.name,
        type: f.type,
        objectId: f.objectId,
        objectType: f.objectType,
      }));
    } catch {
      dynamicFields = undefined;
    }
  }
  return { obj, dynamicFields };
}

export async function runGetObject(input: GetObjectInput): Promise<ObjectResult> {
  const objectId = normaliseObjectId(input.objectId);
  const cacheKey = hashKey(["object", objectId, input.showDynamicFields]);

  return withCache<ObjectResult>(
    cacheKey,
    async () => {
      // Try primary first (respects user's SUI_RPC_URL choice). On any error,
      // retry against the public fallback so a dead gateway doesn't break a
      // tool that doesn't even need indexing.
      let rpcSource: ObjectResult["rpcSource"] = "primary";
      let result;
      try {
        result = await fetchObjectViaClient(getSuiClient(), objectId, input.showDynamicFields);
      } catch (primaryErr) {
        try {
          result = await fetchObjectViaClient(
            getPublicSuiClient(),
            objectId,
            input.showDynamicFields,
          );
          rpcSource = "public-fallback";
        } catch {
          throw primaryErr;
        }
      }

      const { obj, dynamicFields } = result;

      if (obj.error || !obj.data) {
        return { objectId, exists: false, rpcSource };
      }
      const data = obj.data;
      const owner = data.owner;
      let ownerKind: ObjectResult["ownerKind"] = "Unknown";
      let ownerStr: string | undefined;
      if (typeof owner === "string") {
        ownerKind = owner === "Immutable" ? "Immutable" : "Unknown";
        ownerStr = owner;
      } else if (owner && typeof owner === "object") {
        if ("AddressOwner" in owner) {
          ownerKind = "AddressOwner";
          ownerStr = owner.AddressOwner;
        } else if ("ObjectOwner" in owner) {
          ownerKind = "ObjectOwner";
          ownerStr = owner.ObjectOwner;
        } else if ("Shared" in owner) {
          ownerKind = "Shared";
          ownerStr = `Shared@v${owner.Shared.initial_shared_version}`;
        }
      }

      const content = data.content;
      const fields =
        content && content.dataType === "moveObject"
          ? (content.fields as Record<string, unknown>)
          : undefined;

      return {
        objectId: data.objectId,
        exists: true,
        version: data.version,
        digest: data.digest,
        type: data.type,
        owner: ownerStr,
        ownerKind,
        display: (data.display?.data as Record<string, string> | null) ?? undefined,
        fields,
        dynamicFields,
        storageRebate: data.storageRebate,
        description: humanise(data.type, data.display?.data as Record<string, string> | null | undefined, fields),
        rpcSource,
      };
    },
    { ttl: 60, swr: 300 },
  );
}

function humanise(
  type: string | null | undefined,
  display: Record<string, string> | null | undefined,
  fields: Record<string, unknown> | undefined,
): string {
  if (display?.name) return display.name;
  if (!type) return "Sui object";
  if (type.startsWith("0x2::coin::Coin")) {
    const balance = fields?.balance;
    return `Coin object${balance ? ` (balance ${balance})` : ""}`;
  }
  if (type.includes("kiosk::Kiosk")) return "Kiosk (NFT marketplace container)";
  if (type.includes("bag::Bag")) return "Bag (heterogeneous dynamic field container)";
  if (type.includes("table::Table")) return "Table (homogeneous dynamic field container)";
  if (type.includes("UpgradeCap")) return "UpgradeCap (controls package upgrade)";
  if (type.includes("TreasuryCap")) return "TreasuryCap (controls coin minting)";
  return `Object of type ${type.split("::").pop() ?? type}`;
}

export const getObjectTool = tool({
  description:
    "Fetch a Sui object by id, including type, owner, fields, dynamic fields, and Display metadata. Sui-differentiated tool. Accepts short ids like 0x6 (Clock).",
  inputSchema: getObjectParams,
  execute: runGetObject,
});
