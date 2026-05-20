import { hasValidHmacSecret } from '@/lib/env';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const privyAppSecret = process.env.PRIVY_APP_SECRET?.trim();
    if (!privyAppSecret) {
      throw new Error('PRIVY_APP_SECRET is required');
    }

    if (!hasValidHmacSecret(process.env.HMAC_SECRET)) {
      throw new Error('HMAC_SECRET must be at least 32 characters');
    }

    const { getGasStationAddress } = await import('@/lib/gas-station');
    try {
      const address = getGasStationAddress();
      if (address) {
        console.log(`[gas-station] Sui address: ${address}`);
        // Fire-and-forget: health probe must not block startup
        void import('@/lib/gas-station-maintenance').then(
          ({ getGasStationHealthSummary, formatGasStationHealthSummary }) =>
            getGasStationHealthSummary(address).then((summary) => {
              for (const line of formatGasStationHealthSummary(summary)) {
                if (line.startsWith('Warning:')) {
                  console.warn(`[gas-station] ${line}`);
                } else {
                  console.log(`[gas-station] ${line}`);
                }
              }
            }),
        ).catch((error) => {
          console.warn('[gas-station] Failed to load health summary', error);
        });
      } else {
        console.log('[gas-station] Not configured (GAS_STATION_SECRET_KEY missing)');
      }
    } catch (error) {
      console.error('[gas-station] Invalid GAS_STATION_SECRET_KEY configuration', error);
      throw error;
    }
  }
}
