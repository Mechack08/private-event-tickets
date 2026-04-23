import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { createError } from "../middleware/errorHandler.js";
import {
  createEvent,
  listEvents,
  getEventByAddress,
  updateEvent,
} from "../services/eventService.js";

const router = Router();

const createEventSchema = z.object({
  contractAddress: z.string().min(10).max(200),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  location: z.string().min(1).max(300),
  date: z.string().datetime(),
  maxCapacity: z.number().int().min(1).max(100000),
  ticketPrice: z.number().int().nonnegative().optional(),
});

const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  location: z.string().min(1).max(300).optional(),
  date: z.string().datetime().optional(),
  maxCapacity: z.number().int().min(1).max(100000).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /events
 * Returns all active events.
 * Optional query param ?all=true to include inactive (for organizers).
 */
router.get("/", async (req, res, next) => {
  try {
    const activeOnly = req.query["all"] !== "true";
    const events = await listEvents(activeOnly);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /events/by-address/:contractAddress
 * Look up a single event by its on-chain contract address.
 */
router.get("/by-address/:contractAddress", async (req, res, next) => {
  try {
    const event = await getEventByAddress(req.params["contractAddress"]!);
    if (!event) throw createError("Event not found.", 404);
    res.json(event);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /events
 * Create off-chain event metadata after deploying the contract on-chain.
 * Requires authentication.
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createError(parsed.error.issues[0]!.message, 422);
    }

    const { ticketPrice, date, ...rest } = parsed.data;
    const event = await createEvent(req.session.userId!, {
      ...rest,
      date: new Date(date),
      ticketPrice: ticketPrice !== undefined ? BigInt(ticketPrice) : undefined,
    });

    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /events/:id
 * Update event metadata (organiser only).
 */
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createError(parsed.error.issues[0]!.message, 422);
    }

    const { date, ...rest } = parsed.data;
    const event = await updateEvent(req.params["id"]!, req.session.userId!, {
      ...rest,
      ...(date ? { date: new Date(date) } : {}),
    });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

export default router;
