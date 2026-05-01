import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { createError } from "../middleware/errorHandler.js";
import {
  issueTicket,
  markTicketAdmitted,
  getMyTickets,
  getTicketsByEvent,
} from "../services/ticketService.js";
import type { SocketServer } from "../socket.js";

// The router factory accepts the Socket.io server so it can emit events.
export function createTicketsRouter(io: SocketServer): Router {
  const router = Router();

  // Accept any non-empty string for the on-chain txId (hex, no fixed format enforced).
  const txIdString = z.string().min(10).max(256);

  const issueSchema = z.object({
    claimTxId: txIdString,
    eventId: z.string().uuid(),
  });

  const admitSchema = z.object({
    claimTxId: txIdString,
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
        claimTxId: ticket.claimTxId,
        issuedAt: ticket.createdAt,
      });

      res.status(201).json(ticket);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /tickets/admit
   * Mark a ticket as admitted after the organizer scans the QR at the venue.
   */
  router.post("/admit", requireAuth, async (req, res, next) => {
    try {
      const parsed = admitSchema.safeParse(req.body);
      if (!parsed.success) {
        throw createError(parsed.error.issues[0]!.message, 422);
      }

      const ticket = await markTicketAdmitted(parsed.data.claimTxId);

      io.to(`event:${ticket.eventId}`).emit("ticket:admitted", {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        claimTxId: ticket.claimTxId,
        verifiedAt: ticket.verifiedAt,
      });

      res.json(ticket);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
