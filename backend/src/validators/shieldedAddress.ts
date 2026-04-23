import { z } from "zod";

/**
 * Midnight shielded address validation.
 *
 * Observed format (Lace wallet, preprod):
 *   mn_shield-addr_preprod1rvx7qdemq65ztq2tryrrt7ml39v2pwpka9wzags9fne05c36qxzm62n2yfz5pwxjx6pyr4pfgutx2geglr2n68y3jjat9v44r5ed7nsslzkuk
 *
 * Structure: <prefix>1<bech32-data>
 *   - Human-readable part (HRP): lowercase letters, digits, underscores, hyphens
 *   - Separator: digit "1"
 *   - Data: lowercase alphanumeric (Bech32 charset: a-z0-9 minus b,i,o,1)
 *
 * We validate the overall shape permissively to avoid breaking on future
 * wallet versions while still rejecting obviously bad input.
 */
export const shieldedAddressSchema = z
  .string({ required_error: "shieldedAddress is required" })
  .min(10, "shieldedAddress too short")
  .max(500, "shieldedAddress too long")
  // Bech32m: only lowercase alphanumeric, underscores, hyphens
  .regex(/^[a-z0-9_-]+$/, "shieldedAddress contains invalid characters");

export type ShieldedAddress = z.infer<typeof shieldedAddressSchema>;
