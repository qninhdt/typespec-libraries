import { describe, expect, it } from "vitest";
import {
  PG_MAX_IDENTIFIER_LENGTH,
  isPgReservedWord,
  truncatePgIdentifier,
} from "../src/identifier-policy.js";

describe("identifier-policy", () => {
  describe("truncatePgIdentifier", () => {
    it("returns the input when it fits", () => {
      expect(truncatePgIdentifier("users_email_idx")).toBe("users_email_idx");
    });

    it("truncates names over 63 chars and appends an 8-char hash suffix", () => {
      const long = "external_identities_provider_provider_subject_unique_extra_padding";
      expect(long.length).toBeGreaterThan(PG_MAX_IDENTIFIER_LENGTH);
      const truncated = truncatePgIdentifier(long);
      expect(truncated.length).toBeLessThanOrEqual(PG_MAX_IDENTIFIER_LENGTH);
      expect(truncated).toMatch(/_[0-9a-f]{8}$/);
    });

    it("produces stable output for the same input", () => {
      const long = "a".repeat(80);
      expect(truncatePgIdentifier(long)).toBe(truncatePgIdentifier(long));
    });

    it("produces different suffixes for different inputs that share a prefix", () => {
      const a = "shared_prefix_" + "a".repeat(80);
      const b = "shared_prefix_" + "b".repeat(80);
      expect(truncatePgIdentifier(a)).not.toBe(truncatePgIdentifier(b));
    });
  });

  describe("isPgReservedWord", () => {
    it("flags PostgreSQL reserved words case-insensitively", () => {
      expect(isPgReservedWord("user")).toBe(true);
      expect(isPgReservedWord("ORDER")).toBe(true);
      expect(isPgReservedWord("Group")).toBe(true);
      expect(isPgReservedWord("table")).toBe(true);
    });

    it("does not flag ordinary identifiers", () => {
      expect(isPgReservedWord("users")).toBe(false);
      expect(isPgReservedWord("orders")).toBe(false);
      expect(isPgReservedWord("created_at")).toBe(false);
    });
  });
});
