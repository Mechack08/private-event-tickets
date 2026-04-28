import { prisma } from "../lib/prisma.js";
import { createError } from "../middleware/errorHandler.js";
import type { TicketRequest } from "@prisma/client";

export interface CreateRequestInput {
  contractAddress: string;
  requesterName: string;
  note?: string;
}

export interface UpdateRequestInput {
  status: "APPROVED" | "REJECTED";
  ticketNonce?: string;
}

/**
 * Create a new PENDING ticket request.
 * One request per user per event is enforced.
 */
export async function createRequest(
  requesterId: string,
  input: CreateRequestInput,
): Promise<TicketRequest & { event: { contractAddress: string } }> {
  const event = await prisma.event.findUnique({
    where: { contractAddress: input.contractAddress },
    select: { id: true, isActive: true, contractAddress: true },
  });
  if (!event) throw createError("Event not found.", 404);
  if (!event.isActive) throw createError("Event is no longer active.", 410);

  const existing = await prisma.ticketRequest.findFirst({
    where: { eventId: event.id, requesterId },
  });
  if (existing) throw createError("You have already submitted a request for this event.", 409);

  return prisma.ticketRequest.create({
    data: {
      requesterName: input.requesterName,
      note: input.note ?? "",
      eventId: event.id,
      requesterId,
    },
    include: { event: { select: { contractAddress: true } } },
  });
}

/**
 * List all requests for an event (organizer view).
 * Verifies the caller is the event host.
 */
export async function getRequestsByEvent(
  contractAddress: string,
  callerId: string,
): Promise<TicketRequest[]> {
  const event = await prisma.event.findUnique({
    where: { contractAddress },
    select: { id: true, hostId: true },
  });
  if (!event) throw createError("Event not found.", 404);
  if (event.hostId !== callerId) throw createError("Forbidden.", 403);

  return prisma.ticketRequest.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get the calling user's own request for an event, if any.
 * Does NOT return ticketNonce unless the request is APPROVED.
 */
export async function getMyRequest(
  contractAddress: string,
  requesterId: string,
): Promise<Omit<TicketRequest, "ticketNonce"> & { ticketNonce: string | null } | null> {
  const event = await prisma.event.findUnique({
    where: { contractAddress },
    select: { id: true },
  });
  if (!event) return null;

  return prisma.ticketRequest.findFirst({
    where: { eventId: event.id, requesterId },
  });
}

/**
 * Update a request to APPROVED or REJECTED.
 * Only the event host may call this.
 * On approval the ticketNonce (provided by organizer after ZK issuance) is stored.
 */
export async function updateRequestStatus(
  requestId: string,
  callerId: string,
  input: UpdateRequestInput,
): Promise<TicketRequest & { event: { contractAddress: string } }> {
  const req = await prisma.ticketRequest.findUnique({
    where: { id: requestId },
    include: { event: { select: { hostId: true, contractAddress: true } } },
  });
  if (!req) throw createError("Request not found.", 404);
  if (req.event.hostId !== callerId) throw createError("Forbidden.", 403);
  if (req.status !== "PENDING") throw createError("Request has already been processed.", 409);

  const updated = await prisma.ticketRequest.update({
    where: { id: requestId },
    data: {
      status: input.status,
      ticketNonce: input.status === "APPROVED" ? (input.ticketNonce ?? null) : null,
      processedAt: new Date(),
    },
    include: { event: { select: { contractAddress: true } } },
  });

  return updated;
}
