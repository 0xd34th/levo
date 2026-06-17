import { tool } from 'ai';
import { z } from 'zod';
import type { AgentMandate } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { serializeAgentMandate } from './serialize';
import { formatCoinAmount } from './display';
import {
  buildExplorerTools,
  type ExplorerToolContext,
} from './explorer';

type ToolContext = ExplorerToolContext;

// The stored mandate amounts (metadata.amount, coinLimits perTxCap/periodCap)
// are raw on-chain base units (e.g. 6-dp USDC). Handing those integers straight
// to the chat model makes it report 0.01 USDC as "10,000 USDC". Derive
// human-readable strings so the model has a value it can quote verbatim.
function mandateAmountDisplay(m: Pick<AgentMandate, 'coinLimits' | 'metadata'>): {
  amount: string | null;
  perTxCap: string | null;
  periodCap: string | null;
} {
  const limits = Array.isArray(m.coinLimits) ? m.coinLimits : [];
  const primary = limits[0] as
    | { coinType?: unknown; perTxCap?: unknown; periodCap?: unknown }
    | undefined;
  const coinType = typeof primary?.coinType === 'string' ? primary.coinType : null;
  const rawAmount =
    m.metadata && typeof m.metadata === 'object'
      ? (m.metadata as { amount?: unknown }).amount
      : undefined;
  const fmt = (value: unknown): string | null =>
    coinType && typeof value === 'string' && /^\d+$/.test(value)
      ? formatCoinAmount(value, coinType)
      : null;
  return {
    amount: fmt(rawAmount),
    perTxCap: fmt(primary?.perTxCap),
    periodCap: fmt(primary?.periodCap),
  };
}

// Agent tool registry used by `/api/v1/agent/chat`. Each tool is bound to the
// calling user's xUserId so server-side queries never leak cross-tenant data.
export function buildAgentTools(ctx: ToolContext) {
  return {
    ...buildExplorerTools(ctx),

    list_my_mandates: tool({
      description:
        "List the calling user's existing agent mandates. Use this when the user asks about their mandates, history, or current status. Returns up to 20 most-recent rows. When telling the user amounts or caps, always use the `displayAmounts` fields (e.g. \"0.01 USDC\"); the raw `metadata.amount` and `coinLimits` values are on-chain base units, never quote those as token amounts.",
      inputSchema: z.object({}),
      async execute() {
        const rows = await prisma.agentMandate.findMany({
          where: { xUserId: ctx.xUserId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        return {
          mandates: rows.map((row) => ({
            ...serializeAgentMandate(row),
            displayAmounts: mandateAmountDisplay(row),
          })),
        };
      },
    }),

    execute_mandate_now: tool({
      description:
        "Prepare a user-confirmation card for executing the next pending witness step for a mandate the user owns. Use this when the user asks 'run my mandate', 'harvest now', or 'execute'. Never executes directly; the frontend must render a confirmation button that calls /api/v1/agent/mandate/[id]/execute.",
      inputSchema: z.object({
        mandateRowId: z
          .string()
          .min(1)
          .describe('DB row id of the mandate (returned by list_my_mandates as `id`)'),
      }),
      async execute({ mandateRowId }) {
        const mandate = await prisma.agentMandate.findFirst({
          where: { id: mandateRowId, xUserId: ctx.xUserId },
        });
        if (!mandate) {
          return {
            kind: 'execute-confirmation' as const,
            status: 'not_found' as const,
            error: 'Mandate not found or not owned by you',
          };
        }
        return {
          kind: 'execute-confirmation' as const,
          status: 'confirmation_required' as const,
          mandate: {
            ...serializeAgentMandate(mandate),
            displayAmounts: mandateAmountDisplay(mandate),
          },
          executeUrl: `/api/v1/agent/mandate/${mandate.id}/execute`,
          message:
            'User confirmation is required before the agent can execute this mandate.',
        };
      },
    }),
  };
}

export type AgentToolName = keyof ReturnType<typeof buildAgentTools>;
