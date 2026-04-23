import { prisma } from "../lib/prisma.js";
import { createError } from "../middleware/errorHandler.js";
import type { Ticket } from "@prisma/client";

export interface IssueTicketInput {
  commitment: string;
  eventId: string;
}

export async function issueTicket(
  attendeeId: string,
  input: IssueTicketInput
): Promise<Ticket> {
  const existing = await prisma.ticket.findUnique({
    where: { commitment: input.commitment },
  });
  if (existing) {
    throw createError("A ticket with that commitment already exists.", 409);
  }

  // Verify the event exists
  const event = await prisma.event.findUnique({ where: { id: input.eventId } });
  if (!event) throw createError("Event not found.", 404);
  if (!event.isActive) throw createError("Event is no longer active.", 410);

  return prisma.ticket.create({
    data: {
      commitment: input.commitment,
      eventId: input.eventId,
      attendeeId,
    },
  });
}

export async function markTicketVerified(commitment: string): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({ where: { commitment } });
  if (!ticket) throw createError("Ticket not found.", 404);
  if (ticket.isVerified) throw createError("Ticket already verified.", 409);

  return prisma.ticket.update({
    where: { commitment },
    data: { isVerified: true, verifiedAt: new Date() },
  });
}

export async function getMyTickets(attendeeId: string): Promise<Ticket[]> {
  return prisma.ticket.findMany({
    where: { attendeeId },
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTicketsByEvent(eventId: string): Promise<Ticket[]> {
  return prisma.ticket.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
  });
}
