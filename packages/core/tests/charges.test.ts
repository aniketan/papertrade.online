import { describe, expect, it } from "vitest";
import { optionEntryRequirement, optionRoundTripCharges } from "../src";

describe("charges", () => {
  it("estimates one-lot entry requirement", () => {
    expect(optionEntryRequirement(100, 65)).toEqual({
      premiumValue: 6500,
      entryCharges: 26.53,
      required: 6527
    });
  });

  it("estimates round-trip charges", () => {
    expect(optionRoundTripCharges(100, 105, 65).total).toBeGreaterThan(40);
  });
});
