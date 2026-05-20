import { NextRequest } from 'next/server';
import { z } from 'zod';
import { invalidInputResponse, noStoreJson } from '@/lib/api';
import { authenticateRunnerToken, claimDueJobs } from '@/lib/agent/user-agent';

const RequestSchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateRunnerToken(readBearer(req));
  if (!auth.ok) return noStoreJson({ error: auth.error }, { status: auth.status });

  const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidInputResponse();

  const jobs = await claimDueJobs({
    userAgentId: auth.userAgent.id,
    tokenHash: auth.tokenHash,
    limit: parsed.data.limit ?? 5,
  });
  return noStoreJson({ jobs });
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;
}
