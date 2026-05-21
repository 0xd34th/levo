import { createHmac } from 'node:crypto';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { getRedis } from '@/lib/rate-limit';
import { getSuiClient } from '@/lib/sui';

const SUI_COIN = '0x2::sui::SUI';
const SUI_CHAIN_INDEX = '784';
const USDC_COIN =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export interface ExplorerToolContext {
  xUserId: string;
  senderAddress?: string;
}

type JsonRecord = Record<string, unknown>;

const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

function env(name: string, fallback = ''): string {
  const value = process.env[name]?.trim();
  return value && value !== 'replace-me' ? value : fallback;
}

function boolEnv(name: string): boolean {
  const value = env(name).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function okxConfigured(): boolean {
  return Boolean(
    env('OKX_API_KEY') &&
      env('OKX_SECRET_KEY') &&
      (env('OKX_API_PASSPHRASE') || env('OKX_PASSPHRASE')) &&
      env('OKX_PROJECT_ID'),
  );
}

function blockvisionUrl(): string {
  return env('BLOCKVISION_API_URL', 'https://api.blockvision.org/v2/sui');
}

function publicSuiRpcUrl(): string {
  return env('SUI_RPC_PUBLIC_FALLBACK', env('SUI_RPC_URL', 'https://fullnode.mainnet.sui.io:443'));
}

async function cacheGet<T>(key: string): Promise<T | null> {
  const local = memoryCache.get(key);
  if (local && local.expiresAt > Date.now()) return local.value as T;
  if (local) memoryCache.delete(key);

  try {
    const redis = getRedis();
    if (redis.status === 'ready') {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
  } catch {
    // Local memory cache remains available when Redis is absent in dev/tests.
  }
  return null;
}

async function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void> {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  try {
    const redis = getRedis();
    if (redis.status === 'ready') {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
    }
  } catch {
    // Best-effort cache.
  }
}

async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  await cacheSet(key, value, ttlSec);
  return value;
}

async function bvGet<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>,
  ttlSec = 60,
): Promise<T> {
  const apiKey = env('SUIVISION_API_KEY');
  if (!apiKey) throw new Error('SUIVISION_API_KEY is not configured');
  const cleaned = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => [key, String(value)]);
  const cacheKey = `agent:bv:${endpoint}:${JSON.stringify(cleaned)}`;
  return cached(cacheKey, ttlSec, async () => {
    const url = new URL(`${blockvisionUrl()}${endpoint}`);
    for (const [key, value] of cleaned) url.searchParams.set(key, value);
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`BlockVision ${res.status} ${endpoint}`);
    const json = (await res.json()) as JsonRecord;
    const code = json.code;
    if (code !== undefined && code !== 0 && code !== 200 && code !== '0') {
      throw new Error(String(json.message ?? `BlockVision code ${code}`));
    }
    return (json.result ?? json.data ?? json) as T;
  });
}

function normalizeCoinType(input: string | undefined): string {
  if (!input || input.toLowerCase() === 'sui') return SUI_COIN;
  return input;
}

function normalizeObjectId(input: string): string {
  const raw = input.trim();
  const hex = raw.replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length > 64) return raw;
  return `0x${hex.padStart(64, '0')}`;
}

async function resolveAddressOrName(addressOrName: string | undefined, fallback?: string): Promise<string> {
  const value = addressOrName?.trim() || fallback;
  if (!value) throw new Error('No wallet address is available for this request');
  if (/^0x[0-9a-fA-F]{1,64}$/.test(value)) return normalizeSuiAddress(value);
  if (value.endsWith('.sui')) {
    const client = getSuiClient() as unknown as {
      resolveNameServiceAddress?: (input: { name: string }) => Promise<string | null>;
    };
    const resolved = await client.resolveNameServiceAddress?.({ name: value });
    if (resolved) return normalizeSuiAddress(resolved);
  }
  throw new Error(`Could not resolve Sui address: ${value}`);
}

interface CoinMetadata {
  coinType: string;
  symbol: string;
  name?: string;
  decimals: number;
  logo?: string;
  verified?: boolean;
  scamFlag?: number;
  source: 'blockvision' | 'sui-rpc';
}

async function resolveCoinMetadata(coinType: string): Promise<CoinMetadata> {
  try {
    const detail = await bvGet<JsonRecord>('/coin/detail', { coinType }, 600);
    return {
      coinType,
      symbol: String(detail.symbol ?? '?'),
      name: typeof detail.name === 'string' ? detail.name : undefined,
      decimals: Number(detail.decimals ?? 9),
      logo: typeof detail.logo === 'string' ? detail.logo : undefined,
      verified: typeof detail.verified === 'boolean' ? detail.verified : undefined,
      scamFlag: typeof detail.scamFlag === 'number' ? detail.scamFlag : undefined,
      source: 'blockvision',
    };
  } catch {
    const client = getSuiClient() as unknown as {
      getCoinMetadata: (input: { coinType: string }) => Promise<{
        symbol?: string;
        name?: string;
        decimals?: number;
        iconUrl?: string | null;
      } | null>;
    };
    const meta = await client.getCoinMetadata({ coinType });
    if (!meta) throw new Error(`No on-chain CoinMetadata for ${coinType}`);
    return {
      coinType,
      symbol: meta.symbol ?? '?',
      name: meta.name,
      decimals: meta.decimals ?? 9,
      logo: meta.iconUrl ?? undefined,
      source: 'sui-rpc',
    };
  }
}

function toBaseUnits(amount: string, decimals: number): string {
  const cleaned = amount.trim().replace(/_/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Invalid amount: ${amount}`);
  const [whole = '0', fracRaw = ''] = cleaned.split('.');
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, '0');
  return `${whole}${frac}`.replace(/^0+(?=\d)/, '') || '0';
}

function fromBaseUnits(raw: string | number | undefined, decimals: number): string {
  const value = String(raw ?? '0');
  if (!/^\d+$/.test(value)) return value;
  const padded = value.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '') || '0';
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

function okxBaseUrl(): string {
  return env('OKX_BASE_URL', 'https://web3.okx.com');
}

async function okxHeaders(method: 'GET', path: string, query: string): Promise<Record<string, string>> {
  const key = env('OKX_API_KEY');
  const secret = env('OKX_SECRET_KEY');
  const passphrase = env('OKX_API_PASSPHRASE') || env('OKX_PASSPHRASE');
  const project = env('OKX_PROJECT_ID');
  if (!key || !secret || !passphrase || !project) {
    throw new Error('OKX credentials are not configured');
  }
  const timestamp = new Date().toISOString();
  const payload = `${timestamp}${method}${path}${query}`;
  const sign = createHmac('sha256', secret).update(payload).digest('base64');
  return {
    accept: 'application/json',
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': key,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'OK-ACCESS-PROJECT': project,
  };
}

async function okxGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = `?${new URLSearchParams(params).toString()}`;
  const res = await fetch(`${okxBaseUrl()}${path}${query}`, {
    headers: await okxHeaders('GET', path, query),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`OKX ${res.status} ${path}`);
  const json = (await res.json()) as { code?: string; msg?: string; data?: T };
  if (json.code !== '0') throw new Error(json.msg ?? `OKX code ${json.code ?? 'unknown'}`);
  return json.data as T;
}

async function getOkxSwapQuote(input: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps: number;
  senderAddress: string;
}) {
  if (!boolEnv('OKX_SWAP_ENABLED')) throw new Error('OKX swap is disabled');
  if (!okxConfigured()) throw new Error('OKX credentials are not configured');
  const data = await okxGet<Array<JsonRecord>>('/api/v6/dex/aggregator/swap', {
    chainIndex: SUI_CHAIN_INDEX,
    amount: input.amountIn,
    swapMode: 'exactIn',
    fromTokenAddress: input.tokenIn,
    toTokenAddress: input.tokenOut,
    slippagePercent: String(input.slippageBps / 100),
    userWalletAddress: input.senderAddress,
  });
  const first = data?.[0] ?? {};
  const router = (first.routerResult ?? {}) as JsonRecord;
  const tx = (first.tx ?? {}) as JsonRecord;
  const amountOut = String(router.toTokenAmount ?? '0');
  const amountOutMin = String(tx.minReceiveAmount ?? amountOut);
  return {
    source: 'okx' as const,
    sourceLabel: 'OKX V6',
    amountOut,
    amountOutMin,
    priceImpactPct: Number(router.priceImpactPercent ?? 0),
    raw: first,
  };
}

async function getSevenKQuote() {
  const quoteUrl = env('SEVENK_QUOTE_URL');
  if (!quoteUrl) throw new Error('7K quote adapter is not configured');
  throw new Error('7K quote adapter URL is configured but not implemented for this workspace');
}

export async function loadMcpTools(): Promise<{ tools: ToolSet; entries: Array<{ name: string; ok: boolean; error?: string }> }> {
  const raw = env('MCP_SERVERS');
  if (!raw) return { tools: {}, entries: [] };
  let configs: unknown;
  try {
    configs = JSON.parse(raw);
  } catch (error) {
    return {
      tools: {},
      entries: [{ name: 'config', ok: false, error: error instanceof Error ? error.message : 'invalid JSON' }],
    };
  }
  if (!Array.isArray(configs)) {
    return { tools: {}, entries: [{ name: 'config', ok: false, error: 'MCP_SERVERS must be an array' }] };
  }

  const tools: ToolSet = {};
  const entries: Array<{ name: string; ok: boolean; error?: string }> = [];
  for (const cfg of configs) {
    const record = cfg as {
      name?: string;
      url?: string;
      tools?: Array<{ name?: string; description?: string }>;
    };
    const serverName = record.name || 'unnamed';
    if (!record.url || !Array.isArray(record.tools)) {
      entries.push({ name: serverName, ok: false, error: 'HTTP MCP bridge requires url and tools[]' });
      continue;
    }
    entries.push({ name: serverName, ok: true });
    for (const descriptor of record.tools) {
      const remoteName = descriptor.name;
      if (!remoteName || !/^[a-zA-Z0-9_-]+$/.test(remoteName)) continue;
      const localName = `mcp_${serverName}_${remoteName}`.replace(/[^a-zA-Z0-9_]/g, '_');
      tools[localName] = tool({
        description: descriptor.description ?? `MCP tool ${remoteName} from ${serverName}`,
        inputSchema: z.record(z.string(), z.unknown()).default({}),
        async execute(input) {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            Number(env('MCP_TIMEOUT_MS', '3000')),
          );
          try {
            const res = await fetch(record.url!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: remoteName, input }),
              signal: controller.signal,
            });
            if (!res.ok) throw new Error(`MCP ${serverName} ${res.status}`);
            return res.json();
          } finally {
            clearTimeout(timeout);
          }
        },
      });
    }
  }
  return { tools, entries };
}

const AddressInput = z.string().min(1).optional();

export function buildExplorerTools(ctx: ExplorerToolContext) {
  return {
    get_token_metrics: tool({
      description:
        "Fetch Sui token metadata, live price and market stats. Use for token price, token health, SUI price, or market questions.",
      inputSchema: z.object({
        coinType: z.string().default(SUI_COIN),
        window: z.enum(['1H', '24H', '7D', '30D']).default('24H'),
      }),
      async execute(input) {
        const coinType = normalizeCoinType(input.coinType);
        const meta = await resolveCoinMetadata(coinType);
        const warnings: string[] = [];
        let market: JsonRecord | null = null;
        try {
          market = await bvGet<JsonRecord>('/coin/market/pro', { coinType }, 60);
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : 'Market metrics unavailable');
        }

        let price = Number(market?.price ?? 0);
        let priceSource = market ? 'blockvision' : 'unavailable';
        if ((!price || !Number.isFinite(price)) && coinType !== USDC_COIN && ctx.senderAddress) {
          try {
            const quote = await getOkxSwapQuote({
              tokenIn: coinType,
              tokenOut: USDC_COIN,
              amountIn: (10n ** BigInt(meta.decimals)).toString(),
              slippageBps: 50,
              senderAddress: ctx.senderAddress,
            });
            price = Number(quote.amountOut) / 1_000_000;
            priceSource = 'okx';
          } catch {
            // OKX fallback is optional.
          }
        }

        return {
          kind: 'token-card',
          coinType,
          symbol: meta.symbol,
          name: meta.name ?? meta.symbol,
          decimals: meta.decimals,
          logo: meta.logo,
          verified: meta.verified,
          scamFlag: meta.scamFlag,
          price,
          priceSource,
          priceChange24H: market?.priceChangePercentage24H,
          marketCap: market?.marketCap,
          volume24H: market?.volume24H,
          liquidity: market?.liquidity,
          window: input.window,
          warnings,
        };
      },
    }),

    get_portfolio: tool({
      description:
        "Fetch Sui wallet holdings. If addressOrName is omitted, use the server-resolved caller wallet.",
      inputSchema: z.object({
        addressOrName: AddressInput,
        includeNfts: z.boolean().default(true),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      async execute(input) {
        const address = await resolveAddressOrName(input.addressOrName, ctx.senderAddress);
        let source = 'sui-rpc';
        let fallbackReason: string | undefined;
        const topCoins: Array<JsonRecord> = [];
        let totalUsd = 0;

        try {
          const data = await bvGet<{ coins?: JsonRecord[]; data?: JsonRecord[] }>(
            '/account/coins',
            { account: address },
            30,
          );
          const coins = data.coins ?? data.data ?? [];
          source = 'blockvision';
          for (const coin of coins.slice(0, input.limit)) {
            const usdValue = Number(coin.usdValue ?? 0);
            totalUsd += Number.isFinite(usdValue) ? usdValue : 0;
            topCoins.push({
              coinType: coin.coinType,
              symbol: coin.symbol ?? '?',
              name: coin.name,
              decimals: coin.decimals ?? 9,
              balance: coin.balance,
              usdValue,
              price: coin.price,
              verified: coin.verified,
            });
          }
        } catch (error) {
          fallbackReason = error instanceof Error ? error.message : 'BlockVision unavailable';
          if (boolEnv('OKX_FALLBACK_ENABLED') && okxConfigured()) {
            const data = await okxGet<Array<{ tokenAssets?: JsonRecord[] }>>(
              '/api/v6/dex/balance/all-token-balances-by-address',
              { address, chains: SUI_CHAIN_INDEX },
            );
            source = 'okx';
            for (const coin of (data?.[0]?.tokenAssets ?? []).slice(0, input.limit)) {
              const balance = String(coin.balance ?? '0');
              const price = Number(coin.tokenPrice ?? 0);
              const usdValue = Number(balance) * (Number.isFinite(price) ? price : 0);
              totalUsd += Number.isFinite(usdValue) ? usdValue : 0;
              topCoins.push({
                coinType: coin.tokenContractAddress,
                symbol: coin.symbol ?? '?',
                balance,
                usdValue,
                price,
                verified: coin.isRiskToken === false,
              });
            }
          } else {
            const client = getSuiClient() as unknown as {
              getAllBalances: (input: { owner: string }) => Promise<Array<{ coinType: string; totalBalance: string }>>;
            };
            const balances = await client.getAllBalances({ owner: address });
            for (const balance of balances.slice(0, input.limit)) {
              const meta = await resolveCoinMetadata(balance.coinType).catch(() => null);
              topCoins.push({
                coinType: balance.coinType,
                symbol: meta?.symbol ?? balance.coinType.split('::').pop() ?? '?',
                decimals: meta?.decimals ?? 9,
                balance: balance.totalBalance,
                usdValue: 0,
                verified: meta?.verified,
              });
            }
          }
        }

        return {
          kind: 'portfolio-card',
          address,
          source,
          fallbackReason,
          totalUsd,
          coinCount: topCoins.length,
          nftCount: 0,
          topCoins,
          topNfts: [],
        };
      },
    }),

    get_recent_activity: tool({
      description:
        "Fetch recent Sui wallet activity. If addressOrName is omitted, use the server-resolved caller wallet.",
      inputSchema: z.object({
        addressOrName: AddressInput,
        limit: z.number().int().min(1).max(20).default(10),
      }),
      async execute(input) {
        const address = await resolveAddressOrName(input.addressOrName, ctx.senderAddress);
        const items: Array<JsonRecord> = [];
        let source = 'blockvision';
        let fallbackReason: string | undefined;
        try {
          const data = await bvGet<{ data?: JsonRecord[]; items?: JsonRecord[] }>(
            '/account/activities',
            { account: address, pageSize: input.limit },
            30,
          );
          items.push(...(data.data ?? data.items ?? []).slice(0, input.limit));
        } catch (error) {
          fallbackReason = error instanceof Error ? error.message : 'BlockVision unavailable';
          if (boolEnv('OKX_FALLBACK_ENABLED') && okxConfigured()) {
            const data = await okxGet<Array<{ transactionList?: JsonRecord[] }>>(
              '/api/v6/dex/post-transaction/transactions-by-address',
              { address, chains: SUI_CHAIN_INDEX, limit: String(input.limit) },
            );
            source = 'okx';
            items.push(...(data?.[0]?.transactionList ?? []));
          } else {
            source = 'unavailable';
          }
        }
        return { kind: 'activity-card', address, source, fallbackReason, items };
      },
    }),

    get_defi_positions: tool({
      description: "Fetch DeFi positions for a Sui wallet, using BlockVision when available.",
      inputSchema: z.object({ addressOrName: AddressInput }),
      async execute(input) {
        const address = await resolveAddressOrName(input.addressOrName, ctx.senderAddress);
        try {
          const data = await bvGet<JsonRecord>('/account/defi/positions', { account: address }, 60);
          return { kind: 'defi-card', address, source: 'blockvision', positions: data };
        } catch (error) {
          return {
            kind: 'defi-card',
            address,
            source: 'unavailable',
            positions: [],
            warning: error instanceof Error ? error.message : 'DeFi positions unavailable',
          };
        }
      },
    }),

    get_trending: tool({
      description: "Fetch trending Sui pools/tokens.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
      async execute(input) {
        const data = await bvGet<JsonRecord>('/coin/dex/pools', { pageSize: input.limit }, 120);
        return { kind: 'trending-card', source: 'blockvision', items: data };
      },
    }),

    get_nft_collection: tool({
      description: "Fetch NFT collection stats from BlockVision.",
      inputSchema: z.object({ collection: z.string().min(1) }),
      async execute(input) {
        const data = await bvGet<JsonRecord>('/nft/collection/detail', { collection: input.collection }, 300);
        return { kind: 'nft-card', source: 'blockvision', collection: input.collection, data };
      },
    }),

    get_object: tool({
      description: "Fetch a Sui object by id. Short ids like 0x6 are normalized before RPC.",
      inputSchema: z.object({ objectId: z.string().min(1) }),
      async execute(input) {
        const objectId = normalizeObjectId(input.objectId);
        const client = getSuiClient() as unknown as {
          getObject: (input: { id: string; options: JsonRecord }) => Promise<JsonRecord>;
        };
        const object = await client.getObject({
          id: objectId,
          options: { showContent: true, showOwner: true, showType: true, showDisplay: true },
        });
        return { kind: 'object-card', objectId, object };
      },
    }),

    explain_tx: tool({
      description: "Explain a Sui transaction digest in human terms using JSON-RPC transaction data.",
      inputSchema: z.object({ digest: z.string().min(32) }),
      async execute(input) {
        const client = getSuiClient() as unknown as {
          getTransactionBlock: (input: { digest: string; options: JsonRecord }) => Promise<JsonRecord>;
        };
        const tx = await client.getTransactionBlock({
          digest: input.digest,
          options: {
            showInput: true,
            showEffects: true,
            showEvents: true,
            showBalanceChanges: true,
            showObjectChanges: true,
          },
        });
        return explainTransaction(tx);
      },
    }),

    prepare_transfer: tool({
      description:
        "Prepare a transfer confirmation card. Never signs or broadcasts; Levo's explicit wallet approval flow handles execution.",
      inputSchema: z.object({
        toAddressOrName: z.string().min(1),
        coinType: z.string().default(SUI_COIN),
        amount: z.string().min(1),
      }),
      async execute(input) {
        const recipient = await resolveAddressOrName(input.toAddressOrName);
        const coinType = normalizeCoinType(input.coinType);
        const meta = await resolveCoinMetadata(coinType);
        return {
          kind: 'write-card',
          action: 'transfer',
          status: 'confirmation_required',
          recipient,
          recipientResolvedFrom: input.toAddressOrName !== recipient ? input.toAddressOrName : undefined,
          coinType,
          symbol: meta.symbol,
          decimals: meta.decimals,
          amount: input.amount,
          amountRaw: toBaseUnits(input.amount, meta.decimals),
          message: 'Prepared only. Use the Levo wallet approval flow before any transfer is signed.',
        };
      },
    }),

    prepare_swap: tool({
      description:
        "Prepare a swap quote card. Uses server-resolved sender address; never trusts client sender input and never broadcasts.",
      inputSchema: z.object({
        tokenIn: z.string().default(SUI_COIN),
        tokenOut: z.string().min(1),
        amountIn: z.string().min(1),
        slippageBps: z.number().int().min(1).max(10000).default(50),
      }),
      async execute(input) {
        const senderAddress = ctx.senderAddress;
        const tokenIn = normalizeCoinType(input.tokenIn);
        const tokenOut = normalizeCoinType(input.tokenOut);
        const [inMeta, outMeta] = await Promise.all([
          resolveCoinMetadata(tokenIn),
          resolveCoinMetadata(tokenOut),
        ]);
        const amountInRaw = toBaseUnits(input.amountIn, inMeta.decimals);
        const attempts: Array<JsonRecord> = [];
        let quote: Awaited<ReturnType<typeof getOkxSwapQuote>> | null = null;

        if (senderAddress) {
          try {
            quote = await getOkxSwapQuote({
              tokenIn,
              tokenOut,
              amountIn: amountInRaw,
              slippageBps: input.slippageBps,
              senderAddress,
            });
            attempts.push({ source: 'okx', ok: true });
          } catch (error) {
            attempts.push({ source: 'okx', ok: false, error: error instanceof Error ? error.message : 'OKX unavailable' });
          }
        } else {
          attempts.push({ source: 'okx', ok: false, error: 'No server-resolved sender wallet' });
        }
        try {
          await getSevenKQuote();
        } catch (error) {
          attempts.push({ source: '7k', ok: false, error: error instanceof Error ? error.message : '7K unavailable' });
        }

        return {
          kind: 'write-card',
          action: 'swap',
          status: quote ? 'confirmation_required' : 'unavailable',
          source: quote?.source,
          sourceLabel: quote?.sourceLabel,
          tokenIn: { coinType: tokenIn, symbol: inMeta.symbol, decimals: inMeta.decimals },
          tokenOut: { coinType: tokenOut, symbol: outMeta.symbol, decimals: outMeta.decimals },
          amountInHuman: input.amountIn,
          amountOutHuman: quote ? fromBaseUnits(quote.amountOut, outMeta.decimals) : undefined,
          amountOutMinHuman: quote ? fromBaseUnits(quote.amountOutMin, outMeta.decimals) : undefined,
          priceImpactPct: quote?.priceImpactPct,
          attempts,
          message: quote
            ? 'Quote prepared only. Explicit wallet approval is required before signing.'
            : 'Swap quote unavailable with current server flags or providers.',
        };
      },
    }),

    prepare_bridge: tool({
      description:
        "Prepare a bridge confirmation/deeplink card. Production bridge execution is disabled unless OKX_BRIDGE_ENABLED is on.",
      inputSchema: z.object({
        fromChain: z.string().default('sui'),
        toChain: z.string().min(1),
        token: z.string().default('SUI'),
        amount: z.string().min(1),
      }),
      async execute(input) {
        const enabled = boolEnv('OKX_BRIDGE_ENABLED') && okxConfigured();
        const deeplink = `https://www.okx.com/web3/dex-swap/bridge?fromChain=${encodeURIComponent(
          input.fromChain,
        )}&toChain=${encodeURIComponent(input.toChain)}&token=${encodeURIComponent(input.token)}`;
        return {
          kind: 'write-card',
          action: 'bridge',
          status: enabled ? 'confirmation_required' : 'deeplink_only',
          fromChain: input.fromChain,
          toChain: input.toChain,
          token: input.token,
          amount: input.amount,
          deeplink,
          message: enabled
            ? 'Bridge preparation is enabled, but signing remains outside chat.'
            : 'Bridge execution is disabled on this server; use the OKX deeplink to inspect routes.',
        };
      },
    }),

    prepare_earn_mandate_intent: tool({
      description:
        "Create a handoff card for Earn/yield mandate requests. Does not create a mandate; the guided form handles caps, expiry, signing, and initialization.",
      inputSchema: z.object({ intent: z.string().min(3).max(240) }),
      async execute(input) {
        return {
          kind: 'mandate-intent',
          intent: input.intent,
          href: `/agent/new?intent=${encodeURIComponent(input.intent)}`,
          message: 'Continue in the guided mandate form before any wallet approval.',
        };
      },
    }),

    suggest_followups: tool({
      description: "Suggest concise follow-up questions for the current Sui exploration.",
      inputSchema: z.object({ topic: z.string().optional() }),
      async execute(input) {
        const topic = input.topic ?? 'this wallet';
        return {
          kind: 'followups',
          questions: [
            `Show recent activity for ${topic}`,
            `Explain the last transaction for ${topic}`,
            `Check DeFi positions for ${topic}`,
          ],
        };
      },
    }),
  };
}

function explainTransaction(tx: JsonRecord) {
  const digest = String(tx.digest ?? '');
  const effects = (tx.effects ?? {}) as JsonRecord;
  const statusRecord = (effects.status ?? {}) as JsonRecord;
  const status =
    statusRecord.status === 'success'
      ? 'success'
      : statusRecord.status === 'failure'
        ? 'failure'
        : 'unknown';
  const transaction = (tx.transaction ?? {}) as JsonRecord;
  const data = (transaction.data ?? {}) as JsonRecord;
  const sender = String(data.sender ?? '');
  const kind = ((data.transaction ?? {}) as JsonRecord).kind;
  const commands = (((data.transaction ?? {}) as JsonRecord).transactions ?? []) as JsonRecord[];
  const steps = commands.map((cmd, index) => describeCommand(cmd, index));
  const balanceChanges = ((tx.balanceChanges ?? []) as JsonRecord[]).map((change) => ({
    owner: change.owner,
    coinType: change.coinType,
    amount: change.amount,
    direction: String(change.amount ?? '').startsWith('-') ? 'out' : 'in',
  }));
  const objectChanges = ((tx.objectChanges ?? []) as JsonRecord[]).map((change) => ({
    kind: change.type,
    objectId: change.objectId,
    type: change.objectType,
    packageId: change.packageId,
  }));
  const summary = steps.find((step) => /swap/i.test(step.description))
    ? 'Transaction includes a swap route.'
    : steps.length
      ? `Transaction has ${steps.length} programmable step${steps.length === 1 ? '' : 's'}.`
      : `Transaction kind: ${String(kind ?? 'unknown')}.`;
  return {
    kind: 'tx-card',
    digest,
    status,
    errorMessage: statusRecord.error,
    sender,
    timestamp: tx.timestampMs,
    summary,
    steps,
    balanceChanges,
    objectChanges,
  };
}

function describeCommand(cmd: JsonRecord, index: number) {
  if ('MoveCall' in cmd) {
    const moveCall = cmd.MoveCall as JsonRecord;
    const module = String(moveCall.module ?? '');
    const fn = String(moveCall.function ?? '');
    return {
      index,
      kind: 'MoveCall',
      module,
      function: fn,
      package: moveCall.package,
      description: `${module}::${fn}`,
    };
  }
  const key = Object.keys(cmd)[0] ?? 'Other';
  return { index, kind: key, description: key };
}
