import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';

const IP_HEADER_NAMES = [
  'x-real-ip',
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'fly-client-ip',
  'x-forwarded-for',
] as const;

function extractIp(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  for (const candidate of headerValue.split(',')) {
    const ip = candidate.trim();
    if (ip && isIP(ip)) {
      return ip;
    }
  }

  return null;
}

export function getClientIp(req: NextRequest): string {
  for (const headerName of IP_HEADER_NAMES) {
    const ip = extractIp(req.headers.get(headerName));
    if (ip) {
      return ip;
    }
  }

  return 'missing-ip';
}

export function invalidInputResponse() {
  return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
}
