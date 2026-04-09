/**
 * Pre-generate Sui wallets for Twitter users via Privy.
 *
 * Usage:
 *   npx tsx scripts/pregenerate-wallets.ts <input.json>
 *
 * Input format (JSON array):
 *   [
 *     { "subject": "twitter_user_id", "username": "handle", "name": "Display Name" },
 *     ...
 *   ]
 *
 * - `subject` (required): Twitter numeric user ID
 * - `username` (required): Twitter handle (without @)
 * - `name` (optional): Display name, defaults to username
 * - `profile_picture_url` (optional): Profile picture URL
 *
 * Output: <input>-results.json with wallet addresses for airdrop.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { PrivyClient } from '@privy-io/node';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';

interface TwitterUserInput {
  subject: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

interface Result {
  username: string;
  subject: string;
  suiAddress: string;
  privyUserId: string;
  privyWalletId: string;
  status: 'created' | 'existing' | 'error';
  error?: string;
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: npx tsx scripts/pregenerate-wallets.ts <input.json>');
    process.exit(1);
  }

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const databaseUrl = process.env.DATABASE_URL;

  if (!appId || !appSecret) {
    console.error('Error: NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are required');
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL is required');
    process.exit(1);
  }

  const privy = new PrivyClient({ appId, appSecret });
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const users: TwitterUserInput[] = JSON.parse(readFileSync(inputFile, 'utf-8'));
  console.log(`Processing ${users.length} users...\n`);

  const results: Result[] = [];

  for (const input of users) {
    const { subject, username, name, profile_picture_url } = input;
    console.log(`@${username} (${subject})`);

    try {
      // Skip if wallet already provisioned
      const existing = await prisma.xUser.findUnique({
        where: { xUserId: subject },
        select: { suiAddress: true, privyWalletId: true, privyUserId: true },
      });

      if (existing?.suiAddress && existing.privyWalletId) {
        console.log(`  skip: wallet exists → ${existing.suiAddress}`);
        results.push({
          username,
          subject,
          suiAddress: existing.suiAddress,
          privyUserId: existing.privyUserId ?? '',
          privyWalletId: existing.privyWalletId,
          status: 'existing',
        });
        continue;
      }

      // Create Privy user with Twitter linked account + Sui wallet
      const createdUser = await privy.users().create({
        linked_accounts: [
          {
            type: 'twitter_oauth' as const,
            subject,
            username,
            name: name ?? username,
            ...(profile_picture_url ? { profile_picture_url } : {}),
          },
        ],
        wallets: [{ chain_type: 'sui' }],
      });

      const privyUserId = createdUser.id;

      // Fetch wallet details (address + public key)
      const wallets: Array<{ id: string; address: string; public_key: string | null }> = [];
      for await (const w of privy.wallets().list({ user_id: privyUserId, chain_type: 'sui' })) {
        wallets.push({ id: w.id, address: w.address, public_key: w.public_key ?? null });
      }

      if (wallets.length === 0) {
        throw new Error('No Sui wallet returned after creation');
      }

      const wallet = wallets[0]!;
      const suiAddress = normalizeSuiAddress(wallet.address);

      // Persist to DB
      await prisma.xUser.upsert({
        where: { xUserId: subject },
        update: {
          username,
          privyUserId,
          privyWalletId: wallet.id,
          suiAddress,
          suiPublicKey: wallet.public_key,
          ...(profile_picture_url ? { profilePicture: profile_picture_url } : {}),
        },
        create: {
          xUserId: subject,
          username,
          privyUserId,
          privyWalletId: wallet.id,
          suiAddress,
          suiPublicKey: wallet.public_key,
          ...(profile_picture_url ? { profilePicture: profile_picture_url } : {}),
        },
      });

      console.log(`  created → ${suiAddress}`);
      results.push({
        username,
        subject,
        suiAddress,
        privyUserId,
        privyWalletId: wallet.id,
        status: 'created',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  error: ${message}`);
      results.push({
        username,
        subject,
        suiAddress: '',
        privyUserId: '',
        privyWalletId: '',
        status: 'error',
        error: message,
      });
    }
  }

  // Write results
  const outputFile = inputFile.replace(/\.json$/, '') + '-results.json';
  writeFileSync(outputFile, JSON.stringify(results, null, 2));

  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'existing').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(`\n=== Summary ===`);
  console.log(`Created: ${created}  Existing: ${skipped}  Errors: ${errors}`);
  console.log(`Results → ${outputFile}`);

  // Print airdrop address list
  const withAddress = results.filter((r) => r.suiAddress);
  if (withAddress.length > 0) {
    console.log(`\n=== Airdrop Addresses ===`);
    for (const r of withAddress) {
      console.log(`${r.username}\t${r.suiAddress}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
