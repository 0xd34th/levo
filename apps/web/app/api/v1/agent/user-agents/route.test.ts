import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  buildPrivyRawSignAuthorizationRequestMock,
  getPrivyClientMock,
  issueOwnerAgentBindingIntentMock,
  loadOwnerWalletMock,
  rateLimitMock,
  registerUserAgentMock,
  serializeUserAgentMock,
  signSuiTransactionMock,
  verifyOwnerAgentBindingIntentMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  buildPrivyRawSignAuthorizationRequestMock: vi.fn(),
  getPrivyClientMock: vi.fn(),
  issueOwnerAgentBindingIntentMock: vi.fn(),
  loadOwnerWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  registerUserAgentMock: vi.fn(),
  serializeUserAgentMock: vi.fn(),
  signSuiTransactionMock: vi.fn(),
  verifyOwnerAgentBindingIntentMock: vi.fn(),
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

vi.mock('@/lib/agent/mandate-flow', () => ({
  loadOwnerWallet: loadOwnerWalletMock,
}));

vi.mock('@/lib/agent/user-agent', () => ({
  issueOwnerAgentBindingIntent: issueOwnerAgentBindingIntentMock,
  registerUserAgent: registerUserAgentMock,
  serializeUserAgent: serializeUserAgentMock,
  verifyOwnerAgentBindingIntent: verifyOwnerAgentBindingIntentMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: getPrivyClientMock,
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/privy-wallet', () => ({
  buildPrivyRawSignAuthorizationRequest: buildPrivyRawSignAuthorizationRequestMock,
  signSuiTransaction: signSuiTransactionMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userAgent: {
      findMany: vi.fn(),
    },
  },
}));

import { POST } from './route';

const AGENT_ADDRESS = '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b';
const OWNER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/v1/agent/user-agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  }));
}

describe('POST /api/v1/agent/user-agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    loadOwnerWalletMock.mockResolvedValue({
      xUserId: '12345',
      privyWalletId: 'wallet-id',
      suiAddress: OWNER_ADDRESS,
      suiPublicKey: 'owner-public-key',
    });
    issueOwnerAgentBindingIntentMock.mockReturnValue({
      bindingIntent: 'binding-intent',
      payloadBase64: 'AQID',
    });
    buildPrivyRawSignAuthorizationRequestMock.mockReturnValue({
      version: 1,
      method: 'POST',
      url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
      body: { params: { bytes: '00', encoding: 'hex', hash_function: 'blake2b256' } },
      headers: { 'privy-app-id': 'app-id' },
    });
    verifyOwnerAgentBindingIntentMock.mockReturnValue({ ok: true });
    getPrivyClientMock.mockReturnValue({ kind: 'privy-client' });
    signSuiTransactionMock.mockResolvedValue('serialized-owner-signature');
    registerUserAgentMock.mockResolvedValue({
      agent: { id: 'agent-row', agentAddress: AGENT_ADDRESS },
      runnerToken: 'lvo_runner_token',
    });
    serializeUserAgentMock.mockReturnValue({
      id: 'agent-row',
      agentAddress: AGENT_ADDRESS,
      status: 'ACTIVE',
    });
  });

  it('returns a wallet authorization request before registering an external agent', async () => {
    const res = await post({ agentAddress: AGENT_ADDRESS, label: 'Home runner' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'authorization_required',
      authorizationRequest: {
        version: 1,
        method: 'POST',
        url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
        body: { params: { bytes: '00', encoding: 'hex', hash_function: 'blake2b256' } },
        headers: { 'privy-app-id': 'app-id' },
      },
      bindingPayloadBase64: 'AQID',
      bindingIntent: 'binding-intent',
    });
    expect(issueOwnerAgentBindingIntentMock).toHaveBeenCalledWith({
      ownerXUserId: '12345',
      ownerAddress: OWNER_ADDRESS,
      agentAddress: AGENT_ADDRESS,
      label: 'Home runner',
    });
    expect(registerUserAgentMock).not.toHaveBeenCalled();
  });

  it('registers the external agent after the owner wallet authorizes the binding payload', async () => {
    const res = await post({
      agentAddress: AGENT_ADDRESS,
      label: 'Home runner',
      authorizationSignature: 'client-authorization-signature',
      bindingPayloadBase64: 'AQID',
      bindingIntent: 'binding-intent',
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      agent: {
        id: 'agent-row',
        agentAddress: AGENT_ADDRESS,
        status: 'ACTIVE',
      },
      runnerToken: 'lvo_runner_token',
    });
    expect(verifyOwnerAgentBindingIntentMock).toHaveBeenCalledWith('binding-intent', {
      ownerXUserId: '12345',
      ownerAddress: OWNER_ADDRESS,
      agentAddress: AGENT_ADDRESS,
      label: 'Home runner',
      payloadBase64: 'AQID',
    });
    expect(signSuiTransactionMock).toHaveBeenCalledWith(
      { kind: 'privy-client' },
      'wallet-id',
      'owner-public-key',
      new Uint8Array([1, 2, 3]),
      { signatures: ['client-authorization-signature'] },
    );
    expect(registerUserAgentMock).toHaveBeenCalledWith({
      xUserId: '12345',
      agentAddress: AGENT_ADDRESS,
      label: 'Home runner',
    });
  });
});
