import { NextRequest } from 'next/server';
import { getAgentMandateConfig } from '@/lib/agent/config';
import {
  getClientIp,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-config:${ip}`, 60, 30);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) {
    return sameOrigin.response;
  }

  return noStoreJson(getAgentMandateConfig());
}
