import { describe, expect, it, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

describe('user agent binding challenge', () => {
  it('accepts a valid Sui personal-message signature and rejects a bad signer', async () => {
    process.env.HMAC_SECRET = 'x'.repeat(64);
    const {
      issueAgentChallenge,
      verifyAgentChallengeSignature,
    } = await import('./user-agent');
    const agent = new Ed25519Keypair();
    const other = new Ed25519Keypair();
    const agentAddress = agent.getPublicKey().toSuiAddress();
    const challenge = issueAgentChallenge({
      xUserId: '12345',
      agentAddress,
    });
    const message = new TextEncoder().encode(challenge.message);

    const good = await agent.signPersonalMessage(message);
    await expect(
      verifyAgentChallengeSignature({
        xUserId: '12345',
        agentAddress,
        challengeToken: challenge.challengeToken,
        signature: good.signature,
      }),
    ).resolves.toEqual({ ok: true, agentAddress });

    const bad = await other.signPersonalMessage(message);
    await expect(
      verifyAgentChallengeSignature({
        xUserId: '12345',
        agentAddress,
        challengeToken: challenge.challengeToken,
        signature: bad.signature,
      }),
    ).resolves.toEqual({ ok: false, error: 'Invalid agent address signature.' });
  });
});
