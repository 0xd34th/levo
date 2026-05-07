import { describe, expect, it } from "vitest";
import { consumeCredits, grantCredits, getUsage } from "@/lib/credits/tracker";

function uniqueFp() {
  return `fp_${Math.random().toString(36).slice(2, 10)}`;
}

describe("credits", () => {
  it("fast mode burns daily free quota first", async () => {
    const fp = uniqueFp();
    const usage1 = await getUsage(fp);
    expect(usage1.freeRemaining).toBe(usage1.freeLimit);
    const r = await consumeCredits(fp, "fast");
    expect(r.ok).toBe(true);
  });

  it("thinking mode requires paid credits", async () => {
    const fp = uniqueFp();
    const r1 = await consumeCredits(fp, "thinking");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("insufficient_credits");

    await grantCredits(fp, 10);
    const r2 = await consumeCredits(fp, "thinking");
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.paidRemaining).toBe(8); // 10 - 2
  });
});
