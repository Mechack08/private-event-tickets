import { describe, it, expect } from "vitest";
import { shieldedAddressSchema } from "./shieldedAddress.js";

// Real address observed from Lace wallet on preprod
const REAL_ADDRESS =
  "mn_shield-addr_preprod1rvx7qdemq65ztq2tryrrt7ml39v2pwpka9wzags9fne05c36qxzm62n2yfz5pwxjx6pyr4pfgutx2geglr2n68y3jjat9v44r5ed7nsslzkuk";

describe("shieldedAddressSchema", () => {
  describe("valid addresses", () => {
    it("accepts a real Lace preprod address", () => {
      expect(shieldedAddressSchema.safeParse(REAL_ADDRESS).success).toBe(true);
    });

    it("accepts a minimal lower-case alphanumeric address", () => {
      expect(shieldedAddressSchema.safeParse("mn1abcdef0123456789").success).toBe(true);
    });

    it("accepts addresses with underscores and hyphens", () => {
      expect(shieldedAddressSchema.safeParse("mn_shield-addr_preprod1abc123").success).toBe(true);
    });
  });

  describe("invalid addresses", () => {
    it("rejects empty string", () => {
      expect(shieldedAddressSchema.safeParse("").success).toBe(false);
    });

    it("rejects a string that is too short", () => {
      expect(shieldedAddressSchema.safeParse("mn1abc").success).toBe(false);
    });

    it("rejects addresses with uppercase letters", () => {
      expect(shieldedAddressSchema.safeParse("MN_SHIELD1ABC").success).toBe(false);
    });

    it("rejects addresses with spaces", () => {
      expect(shieldedAddressSchema.safeParse("mn shield addr 1abc").success).toBe(false);
    });

    it("rejects addresses with special chars like @, !, /", () => {
      expect(shieldedAddressSchema.safeParse("mn_shield@addr1abc!").success).toBe(false);
    });

    it("rejects non-string input (number)", () => {
      expect(shieldedAddressSchema.safeParse(12345).success).toBe(false);
    });

    it("rejects null", () => {
      expect(shieldedAddressSchema.safeParse(null).success).toBe(false);
    });

    it("rejects a string longer than 500 chars", () => {
      expect(shieldedAddressSchema.safeParse("a".repeat(501)).success).toBe(false);
    });
  });
});
