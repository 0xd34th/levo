import { z } from 'zod';
import { MANDATE_LIMITS, V1_ACTION_MASK } from './package';

const HEX_ADDR = /^0x[0-9a-fA-F]{1,64}$/;
const COIN_TYPE = /^0x[0-9a-fA-F]{1,64}::[a-zA-Z_]\w*::[a-zA-Z_]\w*$/;
const BigIntString = z
  .string()
  .regex(/^\d+$/, 'expected decimal u64 string')
  .transform((s) => BigInt(s));

function nonZeroBigInt(label: string) {
  return BigIntString.refine((n) => n > 0n, `${label} must be > 0`);
}

export const CoinLimitSpecSchema = z
  .object({
    coinType: z.string().regex(COIN_TYPE, 'invalid Move type string'),
    perTxCap: nonZeroBigInt('perTxCap'),
    periodCap: nonZeroBigInt('periodCap'),
  })
  .refine((v) => v.perTxCap <= v.periodCap, {
    message: 'perTxCap must be <= periodCap',
    path: ['perTxCap'],
  });

export const MandateSpecSchema = z.object({
  agent: z.string().regex(HEX_ADDR, 'invalid Sui address'),
  actions: z
    .number()
    .int()
    .positive()
    .refine(
      (a) => (a & V1_ACTION_MASK) === a,
      'V1 only supports earn_* actions (EARN_DEPOSIT | EARN_WITHDRAW | EARN_HARVEST)',
    ),
  coinLimits: z.array(CoinLimitSpecSchema).min(1).max(MANDATE_LIMITS.maxCoinLimits),
  periodMs: BigIntString.refine(
    (n) => n > 0n && n <= MANDATE_LIMITS.maxPeriodMs,
    `periodMs must be in (0, ${MANDATE_LIMITS.maxPeriodMs}]`,
  ),
  allowedTargets: z
    .array(z.string().regex(HEX_ADDR, 'invalid Sui address'))
    .min(1)
    .max(MANDATE_LIMITS.maxTargets),
  expiryMs: BigIntString,
  metadata: z
    .record(
      z
        .string()
        .max(MANDATE_LIMITS.maxMetadataKeyLen, `metadata key > ${MANDATE_LIMITS.maxMetadataKeyLen} bytes`),
      z
        .string()
        .max(MANDATE_LIMITS.maxMetadataValueLen, `metadata value > ${MANDATE_LIMITS.maxMetadataValueLen} bytes`),
    )
    .optional()
    .refine(
      (m) => !m || Object.keys(m).length <= MANDATE_LIMITS.maxMetadataEntries,
      `metadata entries > ${MANDATE_LIMITS.maxMetadataEntries}`,
    ),
});

export type MandateSpecInput = z.input<typeof MandateSpecSchema>;
export type MandateSpec = z.output<typeof MandateSpecSchema>;

// Stable JSON serializer for the spec — useful for displaying in chat / DB / audit.
// Converts bigints to decimal strings; structure is otherwise identical.
export function serializeMandateSpec(spec: MandateSpec): MandateSpecInput {
  return {
    agent: spec.agent,
    actions: spec.actions,
    coinLimits: spec.coinLimits.map((c) => ({
      coinType: c.coinType,
      perTxCap: c.perTxCap.toString(),
      periodCap: c.periodCap.toString(),
    })),
    periodMs: spec.periodMs.toString(),
    allowedTargets: spec.allowedTargets,
    expiryMs: spec.expiryMs.toString(),
    metadata: spec.metadata,
  };
}
