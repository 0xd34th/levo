// One-shot: agent -> gas station SUI address-balance funding so the sponsored
// execute path can prefer address-balance gas.

import 'dotenv/config';
import { Transaction } from '@mysten/sui/transactions';
import { getAgentKeypair } from '../lib/agent/kms';
import { getAgentSuiClient } from '../lib/agent/sui-client';
import { sendFundsToAddressBalance } from '../lib/address-balance';
import { SUI_COIN_TYPE } from '../lib/coins';
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
  sendFundsToAddressBalance({
    tx,
    coin: coin!,
    recipient: dest,
    coinType: SUI_COIN_TYPE,
  });
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
