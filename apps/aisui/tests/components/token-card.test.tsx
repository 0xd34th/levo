import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TokenCard } from "@/components/cards/TokenCard";
import type { TokenMetricsResult } from "@/lib/tools/get-token-metrics";

const SUI_RESULT: TokenMetricsResult = {
  coinType: "0x2::sui::SUI",
  symbol: "SUI",
  name: "Sui",
  decimals: 9,
  verified: true,
  price: 1.23,
  priceSource: "blockvision",
  priceChange24H: 1.5,
  marketCap: 1_000_000,
  fdv: 1_200_000,
  volume24H: 50_000,
  liquidity: 20_000,
  ohlcv: [],
  window: "24H",
  warnings: [],
};

describe("TokenCard", () => {
  it("does not show inactive swap/holders/pools buttons for SUI price results", () => {
    render(<TokenCard data={SUI_RESULT} />);

    expect(screen.queryByRole("button", { name: /swap/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /holders/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /pools/i })).toBeNull();
    expect(screen.getByRole("link", { name: /SuiVision/i })).toBeTruthy();
  });
});
