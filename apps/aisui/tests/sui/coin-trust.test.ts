import { describe, expect, it } from "vitest";
import { classifyCoin, CANONICAL_COIN_TYPES } from "@/lib/sui/coin-trust";
import cetusTrusted from "@/lib/sui/cetus-trusted-coins.json";
import type { BVAccountCoin } from "@/lib/blockvision/types";

function coin(overrides: Partial<BVAccountCoin>): BVAccountCoin {
  return {
    coinType: "0xfake::tok::TOK",
    symbol: "TOK",
    decimals: 9,
    balance: "0",
    ...overrides,
  };
}

describe("classifyCoin", () => {
  it("marks canonical SUI as verified", () => {
    expect(classifyCoin(coin({ coinType: "0x2::sui::SUI", symbol: "SUI" })).trust).toBe(
      "verified",
    );
  });

  it("flags impersonators of protected symbols", () => {
    const v = classifyCoin(coin({ coinType: "0xfake::scam::USDC", symbol: "USDC", usdValue: 1 }));
    expect(v.trust).toBe("suspicious");
    expect(v.reason).toMatch(/USDC/i);
  });

  it("flags unverified high-value tokens as suspicious (the $8M case)", () => {
    const v = classifyCoin(
      coin({ symbol: "DUST", usdValue: 8_050_000, verified: false }),
    );
    expect(v.trust).toBe("suspicious");
  });

  it("treats unverified low-value tokens as unverified, not suspicious", () => {
    const v = classifyCoin(coin({ symbol: "DUST", usdValue: 1.2, verified: false }));
    expect(v.trust).toBe("unverified");
  });

  it("flags implausible 24h price moves as suspicious", () => {
    const v = classifyCoin(
      coin({ symbol: "MOON", usdValue: 5, priceChangePercentage24H: 12_000 }),
    );
    expect(v.trust).toBe("suspicious");
  });

  it("respects provider verified=true for non-canonical coinTypes", () => {
    const v = classifyCoin(coin({ symbol: "NEW", usdValue: 200, verified: true }));
    expect(v.trust).toBe("verified");
  });

  it("does NOT let provider verified=true override symbol impersonation", () => {
    const v = classifyCoin(
      coin({ coinType: "0xfake::scam::USDT", symbol: "USDT", usdValue: 1, verified: true }),
    );
    expect(v.trust).toBe("suspicious");
  });

  it("merges Cetus trusted-coin list into the canonical set", () => {
    expect(cetusTrusted.coins.length).toBeGreaterThan(50);
    for (const c of cetusTrusted.coins) {
      expect(CANONICAL_COIN_TYPES.has(c.address)).toBe(true);
    }
  });

  it("classifies Aftermath AF_LP as lp (excluded from headline)", () => {
    const v = classifyCoin(
      coin({
        coinType:
          "0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf::af_lp::AF_LP",
        symbol: "AF_LP_USDC_SUI",
        usdValue: 8_052_941,
        verified: true, // even when provider says verified, LP must not roll into total
      }),
    );
    expect(v.trust).toBe("lp");
    expect(v.reason).toMatch(/DeFi|LP/i);
  });

  it("classifies a Kriya LP token as lp via coinType module", () => {
    const v = classifyCoin(
      coin({
        coinType: "0xabc::kriya_lp_token::KRIYA_LP",
        symbol: "KRIYA_LP_USDC_SUI",
        usdValue: 1234,
      }),
    );
    expect(v.trust).toBe("lp");
  });

  it("does NOT classify liquid-staking tokens (afSUI/vSUI/haSUI) as lp", () => {
    for (const sym of ["afSUI", "vSUI", "haSUI", "stSUI"]) {
      const v = classifyCoin(
        coin({
          coinType: `0xfake::${sym.toLowerCase()}::${sym.toUpperCase()}`,
          symbol: sym,
          usdValue: 100,
          verified: true,
        }),
      );
      expect(v.trust, `${sym} should not be classified as lp`).not.toBe("lp");
    }
  });

  it("trusts an unverified high-value coin when its coinType is in the Cetus list", () => {
    const sample = cetusTrusted.coins.find((c) => c.symbol && c.address !== "0x2::sui::SUI");
    if (!sample) throw new Error("Cetus trusted list is empty — run `pnpm refresh:trusted-coins`");
    const v = classifyCoin(
      coin({
        coinType: sample.address,
        symbol: sample.symbol ?? "TOK",
        usdValue: 10_000,
        verified: false,
      }),
    );
    expect(v.trust).toBe("verified");
  });
});
