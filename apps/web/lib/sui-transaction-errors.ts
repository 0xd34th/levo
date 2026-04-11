import { getGasStationAddress } from '@/lib/gas-station';
import { buildGasStationRecoveryHint } from '@/lib/gas-station-maintenance';

export const NO_VALID_GAS_COINS_ERROR =
  'No valid gas coins found for the transaction.';

export function annotateNoValidGasCoinsError(message: string): string {
  if (
    !message.includes(NO_VALID_GAS_COINS_ERROR) ||
    message.includes('Gas station address:')
  ) {
    return message;
  }

  let gasStationAddress: string | null = null;
  try {
    gasStationAddress = getGasStationAddress();
  } catch {
    gasStationAddress = null;
  }

  return gasStationAddress
    ? `${message} ${buildGasStationRecoveryHint(gasStationAddress)}`
    : `${message} ${buildGasStationRecoveryHint(null)}`;
}

export function getAnnotatedTransactionErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return annotateNoValidGasCoinsError(error.message);
  }

  if (typeof error === 'string') {
    return annotateNoValidGasCoinsError(error);
  }

  return null;
}
