import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

// Default env so cache + clients build without throwing.
process.env.SUIVISION_API_KEY = process.env.SUIVISION_API_KEY ?? "test-key";
process.env.BLOCKVISION_API_URL = process.env.BLOCKVISION_API_URL ?? "https://api.blockvision.org/v2/sui";
process.env.SUI_RPC_URL = process.env.SUI_RPC_URL ?? "https://fullnode.mainnet.sui.io:443";
process.env.DAILY_FREE_MESSAGES = process.env.DAILY_FREE_MESSAGES ?? "20";
process.env.DAILY_FREE_BV_CALLS = process.env.DAILY_FREE_BV_CALLS ?? "200";
