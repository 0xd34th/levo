import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

let cached: SuiGrpcClient | null = null;

export function getSuiClient(): SuiGrpcClient {
  if (!cached) {
    cached = new SuiGrpcClient({
      baseUrl: getJsonRpcFullnodeUrl("mainnet"),
      network: "mainnet",
    });
  }
  return cached;
}
