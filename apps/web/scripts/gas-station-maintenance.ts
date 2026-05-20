import 'dotenv/config';
import { getGasStationAddress, getGasStationKeypair } from '../lib/gas-station';
import {
  formatGasStationHealthSummary,
  getGasStationHealthSummary,
  listGasStationSuiCoins,
  mergeGasStationCoins,
} from '../lib/gas-station-maintenance';
import { getSuiClient } from '../lib/sui';

type GasStationCommand = 'status' | 'merge';

function parseCommand(rawCommand: string | undefined): GasStationCommand {
  if (!rawCommand || rawCommand === 'status') {
    return 'status';
  }

  if (rawCommand === 'merge') {
    return 'merge';
  }

  throw new Error('Usage: pnpm --dir apps/web gas-station:status | pnpm --dir apps/web gas-station:merge');
}

function requireGasStationAddress() {
  const address = getGasStationAddress();
  if (!address) {
    throw new Error('GAS_STATION_SECRET_KEY is not configured.');
  }

  return address;
}

async function runStatus() {
  const address = requireGasStationAddress();
  const summary = await getGasStationHealthSummary(address);

  for (const line of formatGasStationHealthSummary(summary)) {
    console.log(`[gas-station] ${line}`);
  }
}

async function runMerge() {
  const address = requireGasStationAddress();
  const keypair = getGasStationKeypair();

  if (!keypair) {
    throw new Error('GAS_STATION_SECRET_KEY is not configured.');
  }

  const client = getSuiClient();
  const coins = await listGasStationSuiCoins(address, client);
  const result = await mergeGasStationCoins({
    address,
    coins,
    client,
    keypair,
  });

  console.log(
    `[gas-station] Merged ${result.mergedCount} coins into ${result.primaryCoinObjectId} via ${result.txDigest}`,
  );
}

async function main() {
  const command = parseCommand(process.argv[2]);

  if (command === 'status') {
    await runStatus();
    return;
  }

  await runMerge();
}

main().catch((error) => {
  console.error('[gas-station] Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
