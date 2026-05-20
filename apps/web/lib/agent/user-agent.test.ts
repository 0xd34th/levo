import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

describe('owner-authorized user agent binding intent', () => {
  it('accepts the matching owner wallet binding payload and rejects mismatches', async () => {
    process.env.HMAC_SECRET = 'x'.repeat(64);
    const {
      issueOwnerAgentBindingIntent,
      verifyOwnerAgentBindingIntent,
    } = await import('./user-agent');
    const ownerAddress = '0x0000000000000000000000000000000000000000000000000000000000000123';
    const agentAddress = '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b';
    const binding = issueOwnerAgentBindingIntent({
      ownerXUserId: '12345',
      ownerAddress,
      agentAddress,
      label: 'Home runner',
    });

    expect(
      verifyOwnerAgentBindingIntent(binding.bindingIntent, {
        ownerXUserId: '12345',
        ownerAddress,
        agentAddress,
        label: 'Home runner',
        payloadBase64: binding.payloadBase64,
      }),
    ).toEqual({ ok: true });

    expect(
      verifyOwnerAgentBindingIntent(binding.bindingIntent, {
        ownerXUserId: '12345',
        ownerAddress,
        agentAddress: '0x000000000000000000000000000000000000000000000000000000000000dead',
        label: 'Home runner',
        payloadBase64: binding.payloadBase64,
      }),
    ).toEqual({ ok: false, reason: 'agent binding intent mismatch' });
  });
});
