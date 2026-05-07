import { describe, expect, it } from "vitest";
import { normaliseAddress, normaliseObjectId } from "@/lib/sui/rpc";

describe("normaliseObjectId", () => {
  it("pads short ids to 32-byte form", () => {
    expect(normaliseObjectId("0x6")).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000006",
    );
    expect(normaliseObjectId("0x2")).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
  });

  it("leaves full 32-byte ids alone (just lowercased)", () => {
    const id = "0xC5DE480FD438DB095CA0896F468835B1C45D57EFA85F5000AA59AF9018D14401";
    expect(normaliseObjectId(id)).toBe(
      "0xc5de480fd438db095ca0896f468835b1c45d57efa85f5000aa59af9018d14401",
    );
  });

  it("adds 0x prefix when missing", () => {
    expect(normaliseObjectId("6")).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000006",
    );
  });

  it("returns input unchanged for non-hex", () => {
    expect(normaliseObjectId("foo")).toBe("foo");
    expect(normaliseObjectId("vitalik.sui")).toBe("vitalik.sui");
  });

  it("does not truncate longer-than-64 inputs", () => {
    const tooLong = "0x" + "ab".repeat(40);
    expect(normaliseObjectId(tooLong)).toBe(tooLong);
  });
});

describe("normaliseAddress", () => {
  it("prefixes 0x when missing (preserves case for un-prefixed input)", () => {
    expect(normaliseAddress("ABCDEF")).toBe("0xABCDEF");
  });
  it("lowercases prefixed input", () => {
    expect(normaliseAddress("0xAbC")).toBe("0xabc");
  });
});
