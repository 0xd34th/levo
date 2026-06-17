import { ActionStatus, ActionTrigger } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { createPendingAction, markActionConfirmed, markActionFailed } from './audit';
import { getMandateExecutionBlockReason } from './execution-guard';
import { earnActionFromBits, executeAgentEarnAction } from './earn-actions';
import { isDelegatedSigningConfigured } from './delegated-signing';

export type ExecuteOutcome =
  | { status: 'confirmed'; txDigest: string; actionId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string; actionId: string };

interface CoinLimitRow {
  coinType: string;
  perTxCap: string;
  periodCap: string;
  periodSpent?: string;
  periodStartMs?: string;
}

/**
 * Execute a DB-scheduled mandate once: resolve its Earn action, enforce caps
 * against the confirmed-action ledger, then run the action non-custodially via
 * the platform's delegated Privy signer (deposit/withdraw) or the manager signer
 * (harvest). Records one AgentAction row (PENDING → CONFIRMED/FAILED) — this is
 * what the "Recent runs" panel shows.
 *
 * Caller (scheduler / chat) handles outer-loop Redis locking.
 */
export async function executeMandateNow(args: {
  mandateId: string;
  trigger: ActionTrigger;
}): Promise<ExecuteOutcome> {
  const mandate = await prisma.agentMandate.findUnique({ where: { id: args.mandateId } });
  if (!mandate) {
    return { status: 'failed', reason: 'mandate not found', actionId: '' };
  }

  const blocked = getMandateExecutionBlockReason(mandate, Date.now());
  if (blocked) {
    return { status: 'failed', reason: blocked, actionId: '' };
  }

  if (!isDelegatedSigningConfigured()) {
    return { status: 'failed', reason: 'delegated signing not configured', actionId: '' };
  }

  const action = earnActionFromBits(mandate.actions);
  if (!action) {
    return { status: 'failed', reason: `unsupported mandate action ${mandate.actions}`, actionId: '' };
  }

  const coinLimits = (mandate.coinLimits as CoinLimitRow[] | null) ?? [];
  const coin = coinLimits[0];
  if (!coin) {
    return { status: 'failed', reason: 'mandate has no coin limit', actionId: '' };
  }
  const target = ((mandate.allowedTargets as string[] | null) ?? [])[0] ?? '';
  const metadata = (mandate.metadata as { amount?: string } | null) ?? {};

  // Resolve the per-run amount. Harvest (claim) sweeps whatever yield is owed,
  // so it carries no fixed amount.
  let amount: string | undefined;
  if (action !== 'claim') {
    if (!metadata.amount || !/^\d+$/.test(metadata.amount)) {
      return { status: 'failed', reason: 'mandate is missing a valid amount', actionId: '' };
    }
    amount = metadata.amount;

    // Cap enforcement against the confirmed-action ledger (rolling periodMs window).
    const amt = BigInt(amount);
    const perTxCap = BigInt(coin.perTxCap);
    if (amt > perTxCap) {
      return { status: 'failed', reason: 'amount exceeds per-transaction cap', actionId: '' };
    }
    const periodCap = BigInt(coin.periodCap);
    const windowStart = new Date(Date.now() - Number(mandate.periodMs));
    const recent = await prisma.agentAction.findMany({
      where: { mandateId: mandate.id, status: ActionStatus.CONFIRMED, createdAt: { gte: windowStart } },
      select: { amount: true },
    });
    const spent = recent.reduce((sum, row) => sum + BigInt(row.amount), 0n);
    if (spent + amt > periodCap) {
      return { status: 'skipped', reason: 'period cap reached for this window' };
    }
  }

  const xUser = await prisma.xUser.findUnique({ where: { xUserId: mandate.xUserId } });
  if (!xUser?.privyUserId || !xUser.privyWalletId || !xUser.suiAddress) {
    return { status: 'failed', reason: 'wallet not set up', actionId: '' };
  }
  if (!xUser.agentDelegatedAt) {
    return { status: 'failed', reason: 'wallet not delegated to agent', actionId: '' };
  }

  const actionRow = await createPendingAction({
    mandateId: mandate.id,
    xUserId: mandate.xUserId,
    actionType: mandate.actions,
    coinType: coin.coinType,
    amount: amount ? BigInt(amount) : 0n,
    target,
    trigger: args.trigger,
    sealApproved: true,
  });

  try {
    const result = await executeAgentEarnAction({
      xUserId: mandate.xUserId,
      privyUserId: xUser.privyUserId,
      action,
      amount,
    });
    await markActionConfirmed({
      actionId: actionRow.id,
      txDigest: result.txDigest,
      witnessConsumed: null,
    });
    return { status: 'confirmed', txDigest: result.txDigest, actionId: actionRow.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'execution failed';
    await markActionFailed({ actionId: actionRow.id, errorReason: reason });
    return { status: 'failed', reason, actionId: actionRow.id };
  }
}
