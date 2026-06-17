import { getPrivyClient } from '@/lib/privy-auth';
import { signSuiTransaction } from '@/lib/privy-wallet';

// Non-custodial delegated signing for the agent mandate worker.
//
// The user delegates their Privy embedded wallet to the platform's authorization
// key (a key quorum, `PRIVY_AGENT_SIGNER_ID`) once via the client `addSigners`
// flow. After that, the backend can sign Sui transactions for that wallet
// autonomously by presenting the matching authorization private key
// (`PRIVY_AUTHORIZATION_PRIVATE_KEY`, base64 PKCS8 P-256, no PEM headers) in the
// Privy `authorization_context` — no client round-trip, no custody of funds.

export function getAgentAuthorizationPrivateKey(): string {
  const raw = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error('PRIVY_AUTHORIZATION_PRIVATE_KEY is not configured.');
  }
  return raw;
}

export function getAgentSignerId(): string {
  const raw = process.env.PRIVY_AGENT_SIGNER_ID?.trim();
  if (!raw) {
    throw new Error('PRIVY_AGENT_SIGNER_ID is not configured.');
  }
  return raw;
}

export function isDelegatedSigningConfigured(): boolean {
  return Boolean(
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY?.trim() &&
      process.env.PRIVY_AGENT_SIGNER_ID?.trim(),
  );
}

// Sign Sui transaction bytes on behalf of a user's embedded wallet using the
// app authorization key. Returns the serialized Sui signature string.
export async function signSuiTxAsDelegatedAgent(args: {
  walletId: string;
  suiPublicKey: string;
  txBytes: Uint8Array;
}): Promise<string> {
  return signSuiTransaction(
    getPrivyClient(),
    args.walletId,
    args.suiPublicKey,
    args.txBytes,
    { authorizationPrivateKeys: [getAgentAuthorizationPrivateKey()] },
  );
}
