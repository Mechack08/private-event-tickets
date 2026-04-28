import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { createError } from "../middleware/errorHandler.js";
import {
  createRequest,
  getRequestsByEvent,
  getMyRequest,
  updateRequestStatus,
} from "../services/requestService.js";
import type { SocketServer } from "../socket.js";

const createSchema = z.object({
  contractAddress: z.string().min(5).max(200),
  requesterName: z.string().min(1).max(80),
  note: z.string().max(280).optional(),
});

const updateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  ticketNonce: z.string().max(128).optional(),
});

export function createRequestsRouter(io: SocketServer) {
  const router = Router();

  /**
   * POST /requests
   * Submit a ticket request for an event. Requires auth.
   */
  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        throw createError(parsed.error.issues[0]!.message, 422);
      }

      const ticketRequest = await createRequest(req.session.userId!, parsed.data);

      io.to(`event:${ticketRequest.event.contractAddress}`).emit("request:new", {
        requestId: ticketRequest.id,
        eventId: ticketRequest.eventId,
        contractAddress: ticketRequest.event.contractAddress,
        requesterName: ticketRequest.requesterName,
        note: ticketRequest.note ?? "",
        requestedAt: ticketRequest.createdAt.toISOString(),
      });

      // Never send the nonce back on creation (it's null anyway)
      const { ticketNonce: _, ...safeRequest } = ticketRequest;
      res.status(201).json(safeRequest);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /requests/mine/:contractAddress
   * Returns the calling user's own request for an event (or 404).
   * If approved, includes ticketNonce so the attendee can claim the ticket.
   */
  router.get("/mine/:contractAddress", requireAuth, async (req, res, next) => {
    try {
      const contractAddress = decodeURIComponent(req.params["contractAddress"]!);
      const req_ = await getMyRequest(contractAddress, req.session.userId!);
      if (!req_) {
        res.status(404).json(null);
        return;
      }
      res.json(req_);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /requests/event/:contractAddress
   * List all requests for an event. Caller must be the event host.
   */
  router.get("/event/:contractAddress", requireAuth, async (req, res, next) => {
    try {
      const contractAddress = decodeURIComponent(req.params["contractAddress"]!);
      const requests = await getRequestsByEvent(contractAddress, req.session.userId!);
      res.json(requests);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /requests/:id
   * Approve or reject a request. Caller must be the event host.
   * On approval, supply ticketNonce (the ZK nonce from issueTicket).
   */
  router.patch("/:id", requireAuth, async (req, res, next) => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw createError(parsed.error.issues[0]!.message, 422);
      }

      const updated = await updateRequestStatus(
        req.params["id"]!,
        req.session.userId!,
        parsed.data,
      );

      io.to(`event:${updated.event.contractAddress}`).emit("request:updated", {
        requestId: updated.id,
        eventId: updated.eventId,
        contractAddress: updated.event.contractAddress,
        status: updated.status,
        processedAt: updated.processedAt?.toISOString() ?? new Date().toISOString(),
      });

      // Strip ticketNonce from the response — attendee retrieves it via GET /mine/:addr
      const { ticketNonce: _, ...safeUpdated } = updated;
      res.json(safeUpdated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
