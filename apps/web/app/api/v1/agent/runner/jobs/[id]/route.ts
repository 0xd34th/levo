import { NextRequest } from 'next/server';
import { noStoreJson } from '@/lib/api';
import { authenticateRunnerToken, getRunnerJobPayload } from '@/lib/agent/user-agent';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRunnerToken(readBearer(req));
  if (!auth.ok) return noStoreJson({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const job = await getRunnerJobPayload({
    userAgentId: auth.userAgent.id,
    tokenHash: auth.tokenHash,
    jobId: id,
  });
  if (!job) return noStoreJson({ error: 'Job not found' }, { status: 404 });
  return noStoreJson({ job });
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;
}
