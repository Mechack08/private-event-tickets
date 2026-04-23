import { prisma } from "../lib/prisma.js";
import { createError } from "../middleware/errorHandler.js";
import type { Event } from "@prisma/client";

export interface CreateEventInput {
  contractAddress: string;
  name: string;
  description: string;
  location: string;
  date: Date;
  maxCapacity: number;
  ticketPrice?: bigint;
}

export async function createEvent(
  hostId: string,
  input: CreateEventInput
): Promise<Event> {
  // Prevent duplicate contract addresses
  const existing = await prisma.event.findUnique({
    where: { contractAddress: input.contractAddress },
  });
  if (existing) {
    throw createError("An event with that contract address already exists.", 409);
  }

  return prisma.event.create({
    data: {
      ...input,
      ticketPrice: input.ticketPrice ?? BigInt(0),
      hostId,
    },
  });
}

export async function listEvents(activeOnly = true): Promise<Event[]> {
  return prisma.event.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { date: "asc" },
  });
}

export async function getEventByAddress(
  contractAddress: string
): Promise<Event | null> {
  return prisma.event.findUnique({ where: { contractAddress } });
}

export async function getEventById(id: string): Promise<Event | null> {
  return prisma.event.findUnique({ where: { id } });
}

export async function updateEvent(
  id: string,
  hostId: string,
  patch: Partial<Pick<Event, "name" | "description" | "location" | "date" | "maxCapacity" | "isActive">>
): Promise<Event> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw createError("Event not found.", 404);
  if (event.hostId !== hostId) throw createError("Forbidden.", 403);

  return prisma.event.update({ where: { id }, data: patch });
}
