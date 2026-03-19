import { z } from 'zod';

export const PrivyAuthorizationRequestSchema = z.object({
  version: z.literal(1),
  method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().min(1),
  body: z.object({}).catchall(z.unknown()),
  headers: z.object({
    'privy-app-id': z.string().min(1),
    'privy-idempotency-key': z.string().min(1).optional(),
  }),
});

export type PrivyAuthorizationRequest = z.infer<typeof PrivyAuthorizationRequestSchema>;

export const PrivyAuthorizationRequiredResponseSchema = z.object({
  status: z.literal('authorization_required'),
  authorizationRequest: PrivyAuthorizationRequestSchema,
});

export type PrivyAuthorizationRequiredResponse = z.infer<
  typeof PrivyAuthorizationRequiredResponseSchema
>;

export function parsePrivyAuthorizationRequiredResponse(
  payload: unknown,
): PrivyAuthorizationRequiredResponse | null {
  const parsed = PrivyAuthorizationRequiredResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
