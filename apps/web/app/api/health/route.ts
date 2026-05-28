import { NextResponse } from 'next/server';
import { hasValidHmacSecret } from '@/lib/env';
import { getGasStationAddress } from '@/lib/gas-station';
import { getRedis } from '@/lib/rate-limit';

type CheckStatus = 'ok' | 'degraded';

interface HealthCheck {
  status: CheckStatus;
  message?: string;
  missing?: string[];
}

const SCHEDULER_HEARTBEAT_KEY = 'agent:scheduler:heartbeat';
const SCHEDULER_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 1000;

function configured(name: string): boolean {
  const value = process.env[name]?.trim();
  return Boolean(value) && value !== 'replace-me';
}

async function checkDb(): Promise<HealthCheck> {
  if (!configured('DATABASE_URL')) {
    return { status: 'degraded', message: 'DATABASE_URL is not configured', missing: ['DATABASE_URL'] };
  }
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  } catch {
    return { status: 'degraded', message: 'database query failed' };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  if (!configured('REDIS_URL')) {
    return { status: 'degraded', message: 'REDIS_URL is not configured', missing: ['REDIS_URL'] };
  }
  try {
    const redis = getRedis();
    if (redis.status !== 'ready') {
      return { status: 'degraded', message: `redis is ${redis.status}` };
    }
    await redis.ping();
    return { status: 'ok' };
  } catch {
    return { status: 'degraded', message: 'redis ping failed' };
  }
}

function checkEnv(): HealthCheck {
  const missing = [
    'APP_ORIGIN',
    'NEXT_PUBLIC_PRIVY_APP_ID',
    'PRIVY_APP_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
  ].filter((name) => !configured(name));

  if (!hasValidHmacSecret(process.env.HMAC_SECRET)) {
    missing.push('HMAC_SECRET');
  }

  return missing.length > 0
    ? { status: 'degraded', message: 'required environment is incomplete', missing }
    : { status: 'ok' };
}

function checkGasStation(): HealthCheck {
  if (!configured('GAS_STATION_SECRET_KEY')) {
    return { status: 'degraded', message: 'gas station signer is not configured' };
  }
  try {
    const address = getGasStationAddress();
    return address ? { status: 'ok' } : { status: 'degraded', message: 'gas station signer is unavailable' };
  } catch {
    return { status: 'degraded', message: 'gas station signer is invalid' };
  }
}

async function checkAgentScheduler(): Promise<HealthCheck> {
  const issues: string[] = [];
  if (!configured('LEVO_AGENT_SIGNER_SECRET_KEY')) {
    issues.push('agent signer is not configured');
  }

  try {
    const redis = getRedis();
    if (redis.status !== 'ready') {
      issues.push(`redis is ${redis.status}`);
    } else {
      const raw = await redis.get(SCHEDULER_HEARTBEAT_KEY);
      const heartbeat = raw ? Number(raw) : NaN;
      if (!Number.isFinite(heartbeat)) {
        issues.push('heartbeat missing');
      } else if (Date.now() - heartbeat > SCHEDULER_HEARTBEAT_MAX_AGE_MS) {
        issues.push('heartbeat stale');
      }
    }
  } catch {
    issues.push('heartbeat check failed');
  }

  return issues.length > 0
    ? { status: 'degraded', message: issues.join('; ') }
    : { status: 'ok' };
}

export async function GET() {
  const checks = {
    db: await checkDb(),
    redis: await checkRedis(),
    env: checkEnv(),
    gasStation: checkGasStation(),
    agentScheduler: await checkAgentScheduler(),
  };
  const status: CheckStatus = Object.values(checks).every((check) => check.status === 'ok')
    ? 'ok'
    : 'degraded';

  return NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      checks,
    },
    { status: status === 'ok' ? 200 : 503 },
  );
}
