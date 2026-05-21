import 'dotenv/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { buildAgentTools } from './tools';
import { loadMcpTools } from './explorer';

afterEach(() => {
  vi.restoreAllMocks();
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
        'suggest_followups',
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
