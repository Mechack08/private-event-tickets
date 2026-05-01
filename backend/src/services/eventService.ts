import { prisma } from "../lib/prisma.js";
import { createError } from "../middleware/errorHandler.js";
import type { Event } from "@prisma/client";

/** Event with off-chain ticket claim count included. */
export type EventWithCount = Event & { claimedCount: number };

export interface CreateEventInput {
  contractAddress: string;
  name: string;
  description: string;
  location: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  startDate: Date;
  endDate: Date;
  maxCapacity: number;
  minAge?: number;
}

export async function createEvent(
  hostId: string,
  input: CreateEventInput
): Promise<Event> {
  const existing = await prisma.event.findUnique({
    where: { contractAddress: input.contractAddress },
  });

  if (existing) {
    // A different user claiming the same contract address is always an error.
    if (existing.hostId !== hostId) {
      throw createError("An event with that contract address already exists.", 409);
    }
    // Same host re-syncing after a previous failure — update the metadata and
    // return the record.  This makes POST /events idempotent for the owner so
    // that retrying after a transient failure is always safe.
    return prisma.event.update({
      where: { contractAddress: input.contractAddress },
      data: {
        name:        input.name,
        description: input.description,
        location:    input.location,
        country:     input.country,
        city:        input.city,
        latitude:    input.latitude,
        longitude:   input.longitude,
        startDate:   input.startDate,
        endDate:     input.endDate,
        maxCapacity: input.maxCapacity,
        ...(input.minAge !== undefined ? { minAge: input.minAge } : {}),
      },
    });
  }

  return prisma.event.create({
    data: {
      ...input,
      minAge: input.minAge ?? 0,
      hostId,
    },
  });
}

export async function listEvents(activeOnly = true): Promise<EventWithCount[]> {
  const events = await prisma.event.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { startDate: "asc" },
    include: { _count: { select: { tickets: true } } },
  });
  return events.map(({ _count, ...e }) => ({ ...e, claimedCount: _count.tickets }));
}

export async function getEventByAddress(
  contractAddress: string
): Promise<EventWithCount | null> {
  const event = await prisma.event.findUnique({
    where: { contractAddress },
    include: { _count: { select: { tickets: true } } },
  });
  if (!event) return null;
  const { _count, ...rest } = event;
  return { ...rest, claimedCount: _count.tickets };
}

export async function getEventById(id: string): Promise<Event | null> {
  return prisma.event.findUnique({ where: { id } });
}

export async function updateEvent(
  id: string,
  hostId: string,
  patch: Partial<Pick<Event, "name" | "description" | "location" | "country" | "city" | "latitude" | "longitude" | "startDate" | "endDate" | "maxCapacity" | "isActive">>
): Promise<Event> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw createError("Event not found.", 404);
  if (event.hostId !== hostId) throw createError("Forbidden.", 403);

  return prisma.event.update({ where: { id }, data: patch });
}
