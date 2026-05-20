import { NextRequest } from 'next/server';
import { z } from 'zod';
import { invalidInputResponse, noStoreJson } from '@/lib/api';
import { authenticateRunnerToken, submitRunnerResult } from '@/lib/agent/user-agent';

const RequestSchema = z.object({
  txDigest: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRunnerToken(readBearer(req));
  if (!auth.ok) return noStoreJson({ error: auth.error }, { status: auth.status });

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInputResponse();

  const { id } = await params;
  const result = await submitRunnerResult({
    userAgentId: auth.userAgent.id,
    tokenHash: auth.tokenHash,
    jobId: id,
    txDigest: parsed.data.txDigest,
  });
  return noStoreJson(result, { status: result.status === 'confirmed' ? 200 : 400 });
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;
}
