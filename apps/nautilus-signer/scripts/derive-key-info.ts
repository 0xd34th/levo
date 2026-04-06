import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

interface Options {
  seedBase64?: string;
  label: string;
  json: boolean;
}

function printUsage() {
  console.log(
    [
      'Usage: pnpm derive:key-info -- --seed-base64 <base64> [--label <name>] [--json]',
      '',
      'Derives the Ed25519 public key and Sui address from a base64-encoded 32-byte seed.',
      '',
      'Examples:',
      '  pnpm derive:key-info -- --seed-base64 <BASE64>',
      '  pnpm derive:key-info -- --seed-base64 <BASE64> --label nautilus-mainnet --json',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    label: 'ed25519',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--seed-base64') {
      options.seedBase64 = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--label') {
      options.label = argv[index + 1] || options.label;
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.seedBase64) {
    throw new Error('Missing --seed-base64');
  }

  return options;
}

function decodeSeed(seedBase64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(seedBase64) || seedBase64.length % 4 !== 0) {
    throw new Error('Invalid seed: expected base64-encoded 32-byte value');
  }

  const seed = Buffer.from(seedBase64, 'base64');
  if (seed.length !== 32) {
    throw new Error(`Invalid seed length: expected 32 bytes, got ${seed.length}`);
  }

  return new Uint8Array(seed);
}

const options = parseArgs(process.argv.slice(2).filter((arg) => arg !== '--'));
const seed = decodeSeed(options.seedBase64!);
const keypair = Ed25519Keypair.fromSecretKey(seed);
const publicKeyHex = `0x${Buffer.from(keypair.getPublicKey().toRawBytes()).toString('hex')}`;
const suiAddress = keypair.toSuiAddress();

if (options.json) {
  console.log(
    JSON.stringify(
      {
        label: options.label,
        publicKeyHex,
        suiAddress,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Label: ${options.label}`);
  console.log(`Public key: ${publicKeyHex}`);
  console.log(`Sui address: ${suiAddress}`);
}
