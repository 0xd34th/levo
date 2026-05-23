import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  buildAgentToolsMock,
  loadMcpToolsMock,
  loadOwnerWalletMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  buildAgentToolsMock: vi.fn(),
  loadMcpToolsMock: vi.fn(),
  loadOwnerWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/agent/tools', () => ({
  buildAgentTools: buildAgentToolsMock,
}));

vi.mock('@/lib/agent/explorer', () => ({
  loadMcpTools: loadMcpToolsMock,
}));

vi.mock('@/lib/agent/mandate-flow', () => ({
  loadOwnerWallet: loadOwnerWalletMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { POST } from './route';

function chatRequest() {
  return new NextRequest('http://localhost/api/v1/agent/chat', {
    method: 'POST',
    headers: { origin: 'http://localhost' },
    body: JSON.stringify({
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'SUI price' }] }],
    }),
  });
}

describe('POST /api/v1/agent/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.DEEPSEEK_API_KEY;
    buildAgentToolsMock.mockReturnValue({});
    loadMcpToolsMock.mockResolvedValue({ tools: {}, entries: [] });
    loadOwnerWalletMock.mockResolvedValue(null);
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
        username: 'sender',
        profilePictureUrl: null,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('enforces the chat rate limit by default', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false });

    const res = await POST(chatRequest());

    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith('agent-chat:127.0.0.1', 60, 20);
    expect(verifyPrivyXAuthMock).not.toHaveBeenCalled();
  });

  it('can temporarily bypass only the chat rate limit for production QA', async () => {
    vi.stubEnv('AGENT_CHAT_RATE_LIMIT_DISABLED', '1');

    const res = await POST(chatRequest());

    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(verifyPrivyXAuthMock).toHaveBeenCalled();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'DEEPSEEK_API_KEY is not configured on this server',
    });
  });
});
