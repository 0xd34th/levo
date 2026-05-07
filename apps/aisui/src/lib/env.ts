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
  thinkingProvider: () => maybe("THINKING_PROVIDER", "deepseek-reasoner")!,
  proProvider: () => maybe("PRO_PROVIDER", "deepseek-reasoner")!,

  upstashUrl: () => maybe("UPSTASH_REDIS_REST_URL"),
  upstashToken: () => maybe("UPSTASH_REDIS_REST_TOKEN"),

  sevenKReferralAddr: () => maybe("SEVENK_REFERRAL_ADDRESS"),
  sevenKReferralBps: () => Number.parseInt(maybe("SEVENK_REFERRAL_BPS", "20")!, 10),

  dailyFreeMessages: () => Number.parseInt(maybe("DAILY_FREE_MESSAGES", "20")!, 10),
  dailyFreeBvCalls: () => Number.parseInt(maybe("DAILY_FREE_BV_CALLS", "200")!, 10),
  dailyFreeOkxCalls: () => Number.parseInt(maybe("DAILY_FREE_OKX_CALLS", "200")!, 10),

  publicSuiNetwork: () => maybe("NEXT_PUBLIC_SUI_NETWORK", "mainnet")!,

  okxApiKey: () => maybe("OKX_API_KEY"),
  okxSecretKey: () => maybe("OKX_SECRET_KEY"),
  /** Accept either OKX_API_PASSPHRASE (preferred) or the shorter OKX_PASSPHRASE. */
  okxPassphrase: () => maybe("OKX_API_PASSPHRASE") ?? maybe("OKX_PASSPHRASE"),
  okxProjectId: () => maybe("OKX_PROJECT_ID"),
  okxBaseUrl: () => maybe("OKX_BASE_URL", "https://web3.okx.com")!,
  okxSwapEnabled: () => parseBool(maybe("OKX_SWAP_ENABLED"), false),
  okxFallbackEnabled: () => parseBool(maybe("OKX_FALLBACK_ENABLED"), false),
  okxBridgeEnabled: () => parseBool(maybe("OKX_BRIDGE_ENABLED"), false),

  mcpServers: () => maybe("MCP_SERVERS"),
  mcpTimeoutMs: () => Number.parseInt(maybe("MCP_TIMEOUT_MS", "3000")!, 10),
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off" || v === "") return false;
  return fallback;
}

/** True only if the four-piece OKX credential set is fully configured. */
export function okxConfigured(): boolean {
  return Boolean(env.okxApiKey() && env.okxSecretKey() && env.okxPassphrase() && env.okxProjectId());
}

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
