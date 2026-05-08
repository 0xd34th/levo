/**
 * SuiNS resolver — uses Sui JSON-RPC's suix_resolveNameService* with primary
 * → public-fullnode fallback. The previous GraphQL endpoint
 * (sui-mainnet.mystenlabs.com) is no longer reachable; JSON-RPC is the
 * canonical path supported by every Sui fullnode.
 */
import { getPublicSuiClient, getSuiClient, normaliseAddress } from "./rpc";

async function tryResolve(name: string): Promise<string | null> {
  const attempts = [getSuiClient(), getPublicSuiClient()];
  let lastErr: unknown;
  for (const client of attempts) {
    try {
      const addr = await client.resolveNameServiceAddress({ name });
      if (typeof addr === "string" && addr.length > 0) return normaliseAddress(addr);
      // Null is authoritative ("name not registered") — don't escalate to the
      // next client. Only network errors fall through.
      return null;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function tryReverse(address: string): Promise<string | null> {
  const normalised = normaliseAddress(address);
  const attempts = [getSuiClient(), getPublicSuiClient()];
  let lastErr: unknown;
  for (const client of attempts) {
    try {
      const res = await client.resolveNameServiceNames({ address: normalised });
      const name = res?.data?.[0];
      return typeof name === "string" && name.length > 0 ? name : null;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/** Accept "0x…" (returned as-is) or "name.sui" (resolved via JSON-RPC). */
export async function resolveAddressOrName(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("0x") && trimmed.length >= 3) return normaliseAddress(trimmed);
  if (!trimmed.includes(".")) return null;
  try {
    return await tryResolve(trimmed);
  } catch {
    return null;
  }
}

export async function reverseLookup(address: string): Promise<string | null> {
  try {
    return await tryReverse(address);
  } catch {
    return null;
  }
}
