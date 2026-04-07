import { z } from 'zod';

export const ClaimErrorStageSchema = z.enum([
  'precheck',
  'compose_burn',
  'build',
  'preflight',
  'execute',
]);

export type ClaimErrorStage = z.infer<typeof ClaimErrorStageSchema>;

export const ClaimErrorDetailsSchema = z.object({
  stage: ClaimErrorStageSchema,
  reason: z.string(),
  rawChainError: z.string().nullable(),
  totalStableLayerBalanceRaw: z.string(),
  storedStableLayerBalanceRaw: z.string(),
  incomingStableLayerBalanceRaw: z.string(),
  stableLayerWithdrawAmountRaw: z.string(),
  incomingStableLayerCoinCount: z.number().int().nonnegative(),
});

export type ClaimErrorDetails = z.infer<typeof ClaimErrorDetailsSchema>;

export const ClaimErrorPayloadSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  debugId: z.string().optional(),
  details: ClaimErrorDetailsSchema.optional(),
});

export type ClaimErrorPayload = z.infer<typeof ClaimErrorPayloadSchema>;

export function parseClaimErrorPayload(payload: unknown) {
  const parsed = ClaimErrorPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
