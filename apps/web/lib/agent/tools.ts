import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { serializeAgentMandate } from './serialize';

interface ToolContext {
  xUserId: string;
}

// Agent tool registry used by `/api/v1/agent/chat`. Each tool is bound to the
// calling user's xUserId so server-side queries never leak cross-tenant data.
export function buildAgentTools(ctx: ToolContext) {
  return {
    list_my_mandates: tool({
      description:
        "List the calling user's existing agent mandates. Use this when the user asks about their mandates, history, or current status. Returns up to 20 most-recent rows.",
      inputSchema: z.object({}),
      async execute() {
        const rows = await prisma.agentMandate.findMany({
          where: { xUserId: ctx.xUserId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        return { mandates: rows.map(serializeAgentMandate) };
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
          mandate: serializeAgentMandate(mandate),
          executeUrl: `/api/v1/agent/mandate/${mandate.id}/execute`,
          message:
            'User confirmation is required before the agent can execute this mandate.',
        };
      },
    }),
  };
}

export type AgentToolName = keyof ReturnType<typeof buildAgentTools>;
