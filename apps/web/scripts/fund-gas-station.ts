// One-shot: agent → gas station SUI transfer so the sponsored execute path
// has gas to burn on testnet. Idempotent (transfer succeeds whenever agent
// has at least the requested amount + ~0.005 SUI gas).

import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { getAgentKeypair } from '../lib/agent/kms';
import { getAgentSuiClient } from '../lib/agent/sui-client';
import { getGasStationKeypair } from '../lib/gas-station';

const AMOUNT_MIST = 100_000_000n; // 0.1 SUI

async function main() {
  const client = getAgentSuiClient();
  const agent = getAgentKeypair();
  const gasStation = getGasStationKeypair();
  if (!gasStation) {
    throw new Error('GAS_STATION_SECRET_KEY is not configured');
  }
  const dest = gasStation.toSuiAddress();
  console.log('Agent       :', agent.toSuiAddress());
  console.log('Gas station :', dest);
  console.log(`Sending     : ${AMOUNT_MIST} MIST (${Number(AMOUNT_MIST) / 1e9} SUI)`);

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [AMOUNT_MIST]);
  tx.transferObjects([coin!], dest);
  tx.setSender(agent.toSuiAddress());
  const bytes = await tx.build({ client });
  const { signature } = await agent.signTransaction(bytes);
  const res = await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [signature],
    options: { showEffects: true },
  });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`transfer failed: ${res.effects?.status.error}`);
  }
  console.log('Done. tx:', res.digest);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
