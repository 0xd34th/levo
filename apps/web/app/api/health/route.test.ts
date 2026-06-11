import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getGasStationAddressMock,
  getGasStationHealthSummaryMock,
  queryRawMock,
  redisGetMock,
  redisPingMock,
} = vi.hoisted(() => ({
  getGasStationAddressMock: vi.fn(),
  getGasStationHealthSummaryMock: vi.fn(),
  queryRawMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisPingMock: vi.fn(),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

vi.mock('@/lib/gas-station-maintenance', () => ({
  getGasStationHealthSummary: getGasStationHealthSummaryMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  getRedis: () => ({
    status: 'ready',
    ping: redisPingMock,
    get: redisGetMock,
  }),
}));

import { GET } from './route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    queryRawMock.mockResolvedValue([{ ok: 1 }]);
    redisPingMock.mockResolvedValue('PONG');
    redisGetMock.mockResolvedValue(String(Date.now()));
    vi.stubEnv('DATABASE_URL', 'postgresql://ci:ci@localhost:5432/ci');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_PRIVY_APP_ID', 'test-app');
    vi.stubEnv('PRIVY_APP_SECRET', 'test-secret');
    vi.stubEnv('HMAC_SECRET', 'a'.repeat(64));
    vi.stubEnv('GAS_STATION_SECRET_KEY', 'replace-me');
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', 'replace-me');
    getGasStationAddressMock.mockReturnValue(null);
    getGasStationHealthSummaryMock.mockResolvedValue({
      address: '0xgasstation',
      featureFlagEnabled: true,
      addressBalance: 1_000_000_000n,
      coinBalance: 0n,
      totalBalance: 1_000_000_000n,
      coinCount: 0,
      largestCoinBalance: 0n,
      smallestCoinBalance: 0n,
      warnings: [],
    });
  });

  it('returns structured health checks without exposing secret values', async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'degraded',
      checks: {
        db: { status: 'ok' },
        redis: { status: 'ok' },
        env: { status: 'ok' },
        gasStation: { status: 'degraded' },
        agentScheduler: { status: 'degraded' },
      },
    });
    expect(JSON.stringify(payload)).not.toContain('test-secret');
    expect(JSON.stringify(payload)).not.toContain('aaaaaaaa');
  });

  it('marks required env and stale scheduler heartbeat as degraded', async () => {
    vi.stubEnv('APP_ORIGIN', '');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T00:10:00.000Z'));
    redisGetMock.mockResolvedValue(String(new Date('2026-05-28T00:00:00.000Z').getTime()));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe('degraded');
    expect(payload.checks.env.missing).toContain('APP_ORIGIN');
    expect(payload.checks.agentScheduler.status).toBe('degraded');
    expect(payload.checks.agentScheduler.message).toContain('stale');
  });

  it('returns structured degraded output when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(payload.checks.db).toMatchObject({
      status: 'degraded',
      missing: ['DATABASE_URL'],
    });
  });

  it('reports legacy gas coin fallback as degraded without blocking readiness', async () => {
    vi.stubEnv('GAS_STATION_SECRET_KEY', 'configured-secret');
    getGasStationAddressMock.mockReturnValue('0xgasstation');
    getGasStationHealthSummaryMock.mockResolvedValueOnce({
      address: '0xgasstation',
      featureFlagEnabled: false,
      addressBalance: 0n,
      coinBalance: 250_000_000n,
      totalBalance: 250_000_000n,
      coinCount: 1,
      largestCoinBalance: 250_000_000n,
      smallestCoinBalance: 250_000_000n,
      warnings: [],
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.checks.gasStation).toMatchObject({
      status: 'degraded',
      address: '0xgasstation',
      featureFlagEnabled: false,
      addressBalance: '0',
      coinBalance: '250000000',
      fallbackAvailable: true,
    });
    expect(payload.checks.gasStation.message).toContain('legacy coin fallback available');
  });
});
