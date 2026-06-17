import 'dotenv/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { buildAgentTools } from './tools';
import { loadMcpTools, resetExplorerMemoryCacheForTests } from './explorer';

const FULL_SUI_COIN =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const MAINNET_USDC_COIN =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

afterEach(() => {
  resetExplorerMemoryCacheForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete process.env.MCP_SERVERS;
});

describe('buildAgentTools', () => {
  it('registers mandate tools plus Sui explorer tools', () => {
    const tools = buildAgentTools({ xUserId: 'test-user' });
    expect(Object.keys(tools).sort()).toEqual(
      expect.arrayContaining([
        'execute_mandate_now',
        'list_my_mandates',
        'get_token_metrics',
        'get_portfolio',
        'get_recent_activity',
        'get_defi_positions',
        'get_trending',
        'get_nft_collection',
        'get_object',
        'explain_tx',
        'prepare_transfer',
        'prepare_swap',
        'prepare_bridge',
        'prepare_earn_mandate_intent',
      ]),
    );
  });

  it('each tool carries a description + inputSchema', () => {
    const tools = buildAgentTools({ xUserId: 'test-user' });
    for (const [name, t] of Object.entries(tools) as Array<
      [string, { description?: string; inputSchema?: unknown }]
    >) {
      expect(t.description, `${name}.description`).toBeTruthy();
      expect(t.inputSchema, `${name}.inputSchema`).toBeTruthy();
    }
  });

  it('returns a confirmation payload instead of executing from chat', async () => {
    vi.spyOn(prisma.agentMandate, 'findFirst').mockResolvedValue({
      id: 'mandate-row',
      xUserId: 'test-user',
      userAgentId: 'user-agent-id',
      agentAddress: '0xagent',
      mandateObjectId: '0xmandate',
      name: 'Daily harvest',
      actions: 8,
      coinLimits: [],
      periodMs: 86_400_000n,
      allowedTargets: [],
      expiryMs: BigInt(Date.now() + 86_400_000),
      metadata: {},
      status: 'ACTIVE',
      nonce: 0n,
      witnessCommit: '0xabc',
      createdTxDigest: 'create-digest',
      initTxDigest: 'init-digest',
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
      revokedTxDigest: null,
      revokedAt: null,
      destroyedTxDigest: null,
      destroyedAt: null,
    });

    const tool = buildAgentTools({ xUserId: 'test-user' }).execute_mandate_now as unknown as {
      execute: (input: { mandateRowId: string }) => Promise<unknown>;
    };
    const output = await tool.execute({ mandateRowId: 'mandate-row' });

    expect(output).toMatchObject({
      kind: 'execute-confirmation',
      status: 'confirmation_required',
      executeUrl: '/api/v1/agent/mandate/mandate-row/execute',
    });
  });

  it('prepares Earn mandate intent without creating a mandate', async () => {
    const tool = buildAgentTools({ xUserId: 'test-user' }).prepare_earn_mandate_intent as unknown as {
      execute: (input: { intent: string }) => Promise<unknown>;
    };
    const output = await tool.execute({ intent: 'Harvest Earn rewards daily' });

    expect(output).toMatchObject({
      kind: 'mandate-intent',
      href: '/agent/new?intent=Harvest%20Earn%20rewards%20daily',
    });
  });

  it('prepares transfer cards for inline wallet review without executing from chat', async () => {
    vi.stubEnv('SUIVISION_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const requestUrl = new URL(String(url));
        if (requestUrl.pathname.endsWith('/coin/detail')) {
          return Promise.resolve(
            Response.json({
              code: 200,
              result: {
                coinType: FULL_SUI_COIN,
                symbol: 'SUI',
                decimals: 9,
              },
            }),
          );
        }
        return Promise.reject(new Error(`unexpected URL ${requestUrl.pathname}`));
      }),
    );

    const recipient = '0x0000000000000000000000000000000000000000000000000000000000000123';
    const tool = buildAgentTools({ xUserId: 'test-user' }).prepare_transfer as unknown as {
      execute: (input: { toAddressOrName: string; coinType: string; amount: string }) => Promise<unknown>;
    };
    const output = await tool.execute({ toAddressOrName: recipient, coinType: 'SUI', amount: '1.25' });

    expect(output).toMatchObject({
      kind: 'write-card',
      action: 'transfer',
      status: 'confirmation_required',
      recipient,
      coinType: FULL_SUI_COIN,
      amount: '1.25',
      amountRaw: '1250000000',
      message: 'Prepared only. Use the Review transfer button on this card before any transfer is signed.',
    });
  });

  it('maps SuiVision Pro market fields into token metrics', async () => {
    vi.stubEnv('SUIVISION_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const requestUrl = new URL(String(url));
        if (requestUrl.pathname.endsWith('/coin/detail')) {
          return Promise.resolve(
            Response.json({
              code: 200,
              result: {
                coinType: FULL_SUI_COIN,
                symbol: 'SUI',
                name: 'Sui',
                decimals: 9,
                verified: true,
              },
            }),
          );
        }
        if (requestUrl.pathname.endsWith('/coin/market/pro')) {
          expect(requestUrl.searchParams.get('coinType')).toBe(FULL_SUI_COIN);
          return Promise.resolve(
            Response.json({
              code: 200,
              result: {
                priceInUsd: '3.25',
                marketCap: '1000000',
                liquidityInUsd: '250000',
                volume24H: 12500,
                market: { hour24: { priceChange: '-1.5' } },
              },
            }),
          );
        }
        return Promise.reject(new Error(`unexpected URL ${requestUrl.pathname}`));
      }),
    );

    const tool = buildAgentTools({ xUserId: 'test-user' }).get_token_metrics as unknown as {
      execute: (input: { coinType: string; window: '24H' }) => Promise<Record<string, unknown>>;
    };
    const output = await tool.execute({ coinType: 'sui', window: '24H' });

    expect(output).toMatchObject({
      kind: 'token-card',
      coinType: FULL_SUI_COIN,
      symbol: 'SUI',
      price: 3.25,
      priceChange24H: -1.5,
      marketCap: 1_000_000,
      volume24H: 12_500,
      liquidity: 250_000,
    });
  });

  it('requests SuiVision trending pools with the required canonical coinType', async () => {
    vi.stubEnv('SUIVISION_API_KEY', 'test-key');
    const requested = new Map<string, URL>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const requestUrl = new URL(String(url));
        requested.set(requestUrl.pathname, requestUrl);
        if (requestUrl.pathname.endsWith('/coin/market/pro')) {
          return Promise.resolve(
            Response.json({
              code: 200,
              result: { priceInUsd: '3.25', liquidityInUsd: '250000', volume24H: 12500 },
            }),
          );
        }
        if (requestUrl.pathname.endsWith('/coin/dex/pools')) {
          return Promise.resolve(
            Response.json({
              code: 200,
              result: [
                {
                  dex: 'cetus',
                  poolId: '0xpool',
                  coinList: [
                    '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
                    FULL_SUI_COIN,
                  ],
                  tvl: '100000',
                  apr: '12.5',
                },
              ],
            }),
          );
        }
        if (requestUrl.pathname.endsWith('/coin/trades')) {
          return Promise.resolve(Response.json({ code: 200, result: { data: [{ txDigest: 'abc' }] } }));
        }
        return Promise.reject(new Error(`unexpected URL ${requestUrl.pathname}`));
      }),
    );

    const tool = buildAgentTools({ xUserId: 'test-user' }).get_trending as unknown as {
      execute: (input: { limit: number }) => Promise<Record<string, unknown>>;
    };
    const output = await tool.execute({ limit: 5 });

    const poolsUrl = requested.get('/v2/sui/coin/dex/pools');
    expect(poolsUrl?.searchParams.get('coinType')).toBe(FULL_SUI_COIN);
    expect(poolsUrl?.searchParams.has('pageSize')).toBe(false);
    expect(output).toMatchObject({
      kind: 'trending-card',
      source: 'blockvision',
      coinType: FULL_SUI_COIN,
      items: [
        expect.objectContaining({ kind: 'market', symbol: 'SUI', volume24H: 12_500 }),
        expect.objectContaining({ kind: 'pool', pair: 'DEEP/SUI', dex: 'cetus' }),
      ],
      recentTrades: [{ txDigest: 'abc' }],
    });
  });

  it('fetches DeFi positions only from the selected top Sui protocols', async () => {
    vi.stubEnv('SUIVISION_API_KEY', 'test-key');
    const requestedProtocols: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const requestUrl = new URL(String(url));
        if (requestUrl.pathname.endsWith('/account/defiPortfolio')) {
          const protocol = requestUrl.searchParams.get('protocol') ?? '';
          requestedProtocols.push(protocol);
          const payloadByProtocol: Record<string, unknown> = {
            scallop: { lendings: [{ market: 'SUI', suppliedValueUsd: '12.34' }] },
            cetus: { lps: [{ poolId: '0xpool', valueUsd: '45.67' }] },
          };
          return Promise.resolve(
            Response.json({
              code: 200,
              result: {
                [protocol]: payloadByProtocol[protocol] ?? {},
              },
            }),
          );
        }
        return Promise.reject(new Error(`unexpected URL ${requestUrl.pathname}`));
      }),
    );

    const tool = buildAgentTools({ xUserId: 'test-user' }).get_defi_positions as unknown as {
      execute: (input: { addressOrName: string }) => Promise<Record<string, unknown>>;
    };
    const output = await tool.execute({
      addressOrName: '0x0000000000000000000000000000000000000000000000000000000000000123',
    });

    expect(requestedProtocols).toEqual(['scallop', 'navi', 'suilend', 'cetus', 'bluefin']);
    expect(requestedProtocols).not.toEqual(expect.arrayContaining(['turbos', 'kriya', 'aftermath']));
    expect(output).toMatchObject({
      kind: 'defi-card',
      source: 'blockvision',
      positions: [
        { protocol: 'scallop', categories: 'lendings' },
        { protocol: 'cetus', categories: 'lps' },
      ],
    });
  });

  it('returns a readable trending fallback when the market provider times out', async () => {
    vi.stubEnv('SUIVISION_API_KEY', 'test-key');
    vi.stubEnv('AGENT_TOOL_FETCH_TIMEOUT_MS', '5');
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      ),
    );

    const tool = buildAgentTools({ xUserId: 'test-user' }).get_trending as unknown as {
      execute: (input: { limit: number }) => Promise<unknown>;
    };
    const result = tool.execute({ limit: 5 });
    const timed = Promise.race([
      result,
      new Promise((resolve) => setTimeout(() => resolve('still-pending'), 20)),
    ]);
    await vi.advanceTimersByTimeAsync(20);

    await expect(timed).resolves.toMatchObject({
      kind: 'trending-card',
      source: 'unavailable',
      items: [],
      warning: expect.stringContaining('unavailable'),
    });
    vi.useRealTimers();
  });

  it('maps USDC symbol aliases before opening the local swap panel', async () => {
    vi.stubEnv('SUIVISION_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) => {
        const requestUrl = new URL(String(url));
        if (requestUrl.pathname.endsWith('/coin/detail')) {
          const coinType = requestUrl.searchParams.get('coinType');
          return Promise.resolve(
            Response.json({
              code: 200,
              result: {
                coinType,
                symbol: coinType === MAINNET_USDC_COIN ? 'USDC' : 'SUI',
                decimals: coinType === MAINNET_USDC_COIN ? 6 : 9,
              },
            }),
          );
        }
        return Promise.reject(new Error(`unexpected URL ${requestUrl.pathname}`));
      }),
    );

    const tool = buildAgentTools({
      xUserId: 'test-user',
      senderAddress: '0x123',
    }).prepare_swap as unknown as {
      execute: (input: { tokenIn: string; tokenOut: string; amountIn: string; slippageBps: number }) => Promise<Record<string, unknown>>;
    };
    const output = await tool.execute({ tokenIn: 'SUI', tokenOut: 'USDC', amountIn: '1000000000', slippageBps: 50 });

    expect(output).toMatchObject({
      kind: 'write-card',
      action: 'swap',
      status: 'open_local_surface',
      href: '/agent/new?surface=swap',
      amountInHuman: '1',
      tokenOut: { coinType: MAINNET_USDC_COIN, symbol: 'USDC', decimals: 6 },
      message: 'Open the local swap panel to quote and execute with explicit wallet approval.',
    });
    expect(output.attempts).toBeUndefined();
  });
});

describe('loadMcpTools', () => {
  it('returns an empty registry when MCP_SERVERS is unset', async () => {
    await expect(loadMcpTools()).resolves.toEqual({ tools: {}, entries: [] });
  });

  it('isolates invalid MCP config without breaking local chat tools', async () => {
    process.env.MCP_SERVERS = 'not-json';
    const registry = await loadMcpTools();

    expect(registry.tools).toEqual({});
    expect(registry.entries[0]).toMatchObject({ ok: false });
  });
});
