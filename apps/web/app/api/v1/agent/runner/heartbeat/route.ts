import { NextRequest } from 'next/server';
import { noStoreJson } from '@/lib/api';
import { authenticateRunnerToken } from '@/lib/agent/user-agent';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const auth = await authenticateRunnerToken(readBearer(req));
  if (!auth.ok) return noStoreJson({ error: auth.error }, { status: auth.status });

  await prisma.userAgent.update({
    where: { id: auth.userAgent.id },
    data: { lastHeartbeatAt: new Date() },
  });
  return noStoreJson({ status: 'ok', agentId: auth.userAgent.id });
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7) : null;
}
