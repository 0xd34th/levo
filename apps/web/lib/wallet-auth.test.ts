import { describe, expect, it } from 'vitest';
import {
  buildWalletAuthMessage,
  HISTORY_WALLET_AUTH_PATH,
  signWalletAuthChallenge,
  verifyWalletAuthChallenge,
  type WalletAuthChallengePayload,
} from './wallet-auth';
import { createLegacyHmac } from './scoped-hmac';

const TEST_SECRET = 'a'.repeat(64);

function makePayload(
  overrides: Partial<WalletAuthChallengePayload> = {},
): WalletAuthChallengePayload {
  return {
    address: `0x${'1'.repeat(64)}`,
    origin: 'http://localhost:3000',
    path: HISTORY_WALLET_AUTH_PATH,
    nonce: 'challenge-nonce',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe('buildWalletAuthMessage', () => {
  it('includes the bound route and origin', () => {
    const message = buildWalletAuthMessage(makePayload());
    expect(message).toContain('Levo wallet authentication');
    expect(message).toContain('Origin: http://localhost:3000');
    expect(message).toContain(`URI: ${HISTORY_WALLET_AUTH_PATH}`);
  });
});

describe('verifyWalletAuthChallenge', () => {
  it('returns the payload for a valid token', () => {
    const payload = makePayload();
    const token = signWalletAuthChallenge(payload, TEST_SECRET);
    expect(verifyWalletAuthChallenge(token, TEST_SECRET)).toEqual(payload);
  });

  it('returns null for a tampered token', () => {
    const token = signWalletAuthChallenge(makePayload(), TEST_SECRET);
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(verifyWalletAuthChallenge(tampered, TEST_SECRET)).toBeNull();
  });

  it('returns null for an expired token', () => {
    const payload = makePayload({ expiresAt: Date.now() - 1000 });
    const token = signWalletAuthChallenge(payload, TEST_SECRET);
    expect(verifyWalletAuthChallenge(token, TEST_SECRET)).toBeNull();
  });

  it('accepts legacy unscoped challenge tokens during rollout', () => {
    const payload = makePayload();
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${payloadB64}.${createLegacyHmac(payloadB64, TEST_SECRET)}`;

    expect(verifyWalletAuthChallenge(token, TEST_SECRET)).toEqual(payload);
  });

  it('rejects legacy quote tokens during rollout', () => {
    const quotePayload = {
      xUserId: '12345',
      derivationVersion: 1,
      vaultAddress: '0xvault',
      coinType: '0x2::sui::SUI',
      amount: '1000000',
      senderAddress: `0x${'2'.repeat(64)}`,
      nonce: 'quote-nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
    const payloadB64 = Buffer.from(JSON.stringify(quotePayload)).toString('base64url');
    const token = `${payloadB64}.${createLegacyHmac(payloadB64, TEST_SECRET)}`;

    expect(verifyWalletAuthChallenge(token, TEST_SECRET)).toBeNull();
  });
});
