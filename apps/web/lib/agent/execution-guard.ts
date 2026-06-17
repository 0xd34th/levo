import type { AgentMandate } from '@/lib/generated/prisma/client';

export function getMandateExecutionBlockReason(
  mandate: Pick<
    AgentMandate,
    | 'status'
    | 'expiryMs'
    | 'revokedAt'
    | 'revokedTxDigest'
    | 'destroyedAt'
    | 'destroyedTxDigest'
  >,
  nowMs = Date.now(),
): string | null {
  if (mandate.status !== 'ACTIVE') {
    return `mandate is not active (${mandate.status})`;
  }
  if (mandate.revokedAt || mandate.revokedTxDigest) {
    return 'mandate has been revoked';
  }
  if (mandate.destroyedAt || mandate.destroyedTxDigest) {
    return 'mandate has been destroyed';
  }
  if (mandate.expiryMs <= BigInt(nowMs)) {
    return 'mandate has expired';
  }
  return null;
}
