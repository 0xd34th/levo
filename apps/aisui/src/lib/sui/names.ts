/** SuiNS resolver — best-effort; falls back to raw address. */
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { graphql } from "@mysten/sui/graphql/schema";
import { normaliseAddress } from "./rpc";

const RESOLVE_QUERY = graphql(`
  query ResolveSuiNS($name: String!) {
    resolveSuinsAddress(domain: $name)
  }
`);

const REVERSE_QUERY = graphql(`
  query ReverseSuiNS($address: SuiAddress!) {
    address(address: $address) {
      defaultSuinsName
    }
  }
`);

let gqlClient: SuiGraphQLClient | null = null;

function gql(): SuiGraphQLClient {
  if (!gqlClient) {
    gqlClient = new SuiGraphQLClient({
      url: "https://sui-mainnet.mystenlabs.com/graphql",
      network: "mainnet",
    });
  }
  return gqlClient;
}

/** Accept "0x…" (returned as-is) or "name.sui" (resolved via GraphQL). */
export async function resolveAddressOrName(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("0x") && trimmed.length >= 3) return normaliseAddress(trimmed);
  if (!trimmed.includes(".")) return null;
  try {
    const res = await gql().query({ query: RESOLVE_QUERY, variables: { name: trimmed } });
    const addr = res.data?.resolveSuinsAddress;
    if (typeof addr !== "string" || addr.length === 0) return null;
    return normaliseAddress(addr);
  } catch {
    return null;
  }
}

export async function reverseLookup(address: string): Promise<string | null> {
  try {
    const res = await gql().query({
      query: REVERSE_QUERY,
      variables: { address: normaliseAddress(address) },
    });
    const name = res.data?.address?.defaultSuinsName;
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}
