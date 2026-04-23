import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { createError } from "../middleware/errorHandler.js";
import {
  issueTicket,
  markTicketVerified,
  getMyTickets,
  getTicketsByEvent,
} from "../services/ticketService.js";
import type { SocketServer } from "../socket.js";

// The router factory accepts the Socket.io server so it can emit events.
export function createTicketsRouter(io: SocketServer): Router {
  const router = Router();

  const issueSchema = z.object({
    commitment: z
      .string()
      .min(10)
      .max(128)
      .regex(/^[0-9a-f]+$/i, "commitment must be a hex string"),
    eventId: z.string().uuid(),
  });

  const verifySchema = z.object({
    commitment: z
      .string()
      .min(10)
      .max(128)
      .regex(/^[0-9a-f]+$/i, "commitment must be a hex string"),
  });

  /**
   * GET /tickets/mine
   * Returns all tickets belonging to the authenticated user.
   */
  router.get("/mine", requireAuth, async (req, res, next) => {
    try {
      const tickets = await getMyTickets(req.session.userId!);
      res.json(tickets);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /tickets/event/:eventId
   * Returns all tickets for an event (organiser view).
   */
  router.get("/event/:eventId", requireAuth, async (req, res, next) => {
    try {
      const tickets = await getTicketsByEvent(req.params["eventId"]!);
      res.json(tickets);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /tickets
   * Register a newly issued ticket's commitment after calling issueTicket on-chain.
   */
  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const parsed = issueSchema.safeParse(req.body);
      if (!parsed.success) {
        throw createError(parsed.error.issues[0]!.message, 422);
      }

      const ticket = await issueTicket(req.session.userId!, parsed.data);

      // Broadcast to all clients watching this event's room
      io.to(`event:${ticket.eventId}`).emit("ticket:issued", {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        commitment: ticket.commitment,
        issuedAt: ticket.createdAt,
      });

      res.status(201).json(ticket);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /tickets/verify
   * Mark a ticket as verified (called by the organiser after on-chain ZK proof succeeds).
   */
  router.post("/verify", requireAuth, async (req, res, next) => {
    try {
      const parsed = verifySchema.safeParse(req.body);
      if (!parsed.success) {
        throw createError(parsed.error.issues[0]!.message, 422);
      }

      const ticket = await markTicketVerified(parsed.data.commitment);

      io.to(`event:${ticket.eventId}`).emit("ticket:verified", {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        commitment: ticket.commitment,
        verifiedAt: ticket.verifiedAt,
      });

      res.json(ticket);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
