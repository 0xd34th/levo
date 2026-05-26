import { describe, expect, it } from "vitest";
import { consumeCredits, getUsage, grantCredits } from "@/lib/credits/tracker";

function uniqueFp() {
  return `fp_${Math.random().toString(36).slice(2, 10)}`;
}

describe("credits", () => {
  it("fast mode burns daily free quota first", async () => {
    const fp = uniqueFp();
    const usage1 = await getUsage(fp);
    expect(usage1.freeRemaining).toBe(usage1.freeLimit);

    const result = await consumeCredits(fp, "fast");

    expect(result.ok).toBe(true);
    expect(result.freeRemaining).toBe(usage1.freeLimit - 1);
  });

  it("paid grants persist on the user balance", async () => {
    const fp = uniqueFp();

    const next = await grantCredits(fp, 10);
    const usage = await getUsage(fp);

    expect(next).toBe(10);
    expect(usage.paidRemaining).toBe(10);
  });
});
