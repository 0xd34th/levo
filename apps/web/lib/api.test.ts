import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getExpectedOrigin, parseSuiAddress } from './api';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getExpectedOrigin', () => {
  it('returns the request origin in non-production without APP_ORIGIN', () => {
    vi.stubEnv('APP_ORIGIN', '');
    vi.stubEnv('NODE_ENV', 'development');

    const req = new NextRequest('http://localhost:3000/api/v1/payments/history');
    expect(getExpectedOrigin(req)).toBe('http://localhost:3000');
  });

  it('requires APP_ORIGIN in production', () => {
    vi.stubEnv('APP_ORIGIN', '');
    vi.stubEnv('NODE_ENV', 'production');

    const req = new NextRequest('http://localhost:3000/api/v1/payments/history');
    expect(getExpectedOrigin(req)).toBeNull();
  });

  it('prefers APP_ORIGIN over the request host', () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.com');
    vi.stubEnv('NODE_ENV', 'production');

    const req = new NextRequest('http://localhost:3000/api/v1/payments/history');
    expect(getExpectedOrigin(req)).toBe('https://app.example.com');
  });
});

describe('parseSuiAddress', () => {
  it('normalizes short-form addresses', () => {
    expect(parseSuiAddress('0x2')).toBe(`0x${'0'.repeat(63)}2`);
  });

  it('returns null for invalid addresses', () => {
    expect(parseSuiAddress('not-an-address')).toBeNull();
  });
});
