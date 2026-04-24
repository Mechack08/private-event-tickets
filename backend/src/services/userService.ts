import { prisma } from "../lib/prisma.js";
import type { User } from "@prisma/client";

/**
 * Upsert a user by their Google sub (googleId).
 * Creates the user on first sign-in; updates name on subsequent sign-ins.
 */
export async function upsertGoogleUser(
  googleId: string,
  email: string,
  name?: string,
): Promise<User> {
  return prisma.user.upsert({
    where: { googleId },
    update: { email, name: name ?? undefined, updatedAt: new Date() },
    create: { googleId, email, name: name ?? null },
  });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
