import { prisma } from "../lib/prisma.js";
import type { User } from "@prisma/client";

/**
 * Upsert a user by their Midnight shielded address.
 * On first connection the user row is created; on subsequent connections
 * `updatedAt` is bumped but nothing else changes.
 */
export async function upsertUser(shieldedAddress: string): Promise<User> {
  return prisma.user.upsert({
    where: { shieldedAddress },
    update: { updatedAt: new Date() },
    create: { shieldedAddress },
  });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
