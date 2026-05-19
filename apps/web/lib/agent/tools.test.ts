import 'dotenv/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { buildAgentTools } from './tools';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildAgentTools', () => {
  it('registers only existing-mandate tools', () => {
    const tools = buildAgentTools({ xUserId: 'test-user' });
    expect(Object.keys(tools).sort()).toEqual([
      'execute_mandate_now',
      'list_my_mandates',
    ]);
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
});
