import { getGasStationAddress } from '@/lib/gas-station';

export const NO_VALID_GAS_COINS_ERROR =
  'No valid gas coins found for the transaction.';

const GAS_STATION_ADDRESS_LABEL = 'Gas station address:';

export function annotateNoValidGasCoinsError(message: string): string {
  if (
    !message.includes(NO_VALID_GAS_COINS_ERROR) ||
    message.includes(GAS_STATION_ADDRESS_LABEL)
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
    ? `${message} ${GAS_STATION_ADDRESS_LABEL} ${gasStationAddress}`
    : `${message} ${GAS_STATION_ADDRESS_LABEL} unavailable`;
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
