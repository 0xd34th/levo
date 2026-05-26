/** Centralised env access. Server-only unless prefixed with NEXT_PUBLIC_. */
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function maybe(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  return fallback;
}

export const env = {
  blockvisionKey: () => need("SUIVISION_API_KEY"),
  blockvisionApiUrl: () => maybe("BLOCKVISION_API_URL", "https://api.blockvision.org/v2/sui")!,
  suiRpcUrl: () => maybe("SUI_RPC_URL", "https://fullnode.mainnet.sui.io:443")!,
  /** Always-on public Sui RPC for fallback paths (coin metadata, sanity reads).
   *  Independent of SUI_RPC_URL so users with a paid/rate-limited primary gateway
   *  still have a free escape hatch. */
  suiRpcPublicFallback: () =>
    maybe("SUI_RPC_PUBLIC_FALLBACK", "https://fullnode.mainnet.sui.io:443")!,
  deepseekKey: () => maybe("DEEPSEEK_API_KEY"),
  deepseekBaseUrl: () => maybe("DEEPSEEK_BASE_URL"),
  defaultProvider: () => maybe("DEFAULT_PROVIDER", "deepseek-chat")!,

  upstashUrl: () => maybe("UPSTASH_REDIS_REST_URL"),
  upstashToken: () => maybe("UPSTASH_REDIS_REST_TOKEN"),

  publicSuiNetwork: () => maybe("NEXT_PUBLIC_SUI_NETWORK", "mainnet")!,

  mcpServers: () => maybe("MCP_SERVERS"),
  mcpTimeoutMs: () => Number.parseInt(maybe("MCP_TIMEOUT_MS", "3000")!, 10),
};

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
