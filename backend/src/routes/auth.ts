import { Router } from "express";
import { z } from "zod";
import { upsertUser, findUserById } from "../services/userService.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { createError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Bech32m shielded addresses start with the network prefix (e.g. "mn_shield_")
// We do a generous pattern check to prevent junk data hitting the DB.
const shieldedAddressSchema = z
  .string()
  .min(40)
  .max(200)
  .regex(/^[a-z0-9_]+$/, "Invalid shielded address format");

/**
 * POST /auth/connect
 * Body: { shieldedAddress: string }
 *
 * The frontend calls this immediately after the wallet's connect() resolves
 * and it receives the shieldedAddress. The server upserts the User row,
 * regenerates the session ID (prevents session fixation), and sets an
 * httpOnly cookie.
 */
router.post("/connect", authLimiter, async (req, res, next) => {
  try {
    const parsed = shieldedAddressSchema.safeParse(req.body.shieldedAddress);
    if (!parsed.success) {
      throw createError("Invalid shieldedAddress.", 422);
    }

    const user = await upsertUser(parsed.data);

    // Regenerate session ID to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user.id;
      req.session.shieldedAddress = user.shieldedAddress;

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.status(200).json({
          id: user.id,
          shieldedAddress: user.shieldedAddress,
          createdAt: user.createdAt,
        });
      });
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 * Returns the currently authenticated user.
 * Used by the frontend on mount to restore wallet session state after refresh.
 */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.session.userId!);
    if (!user) {
      // Session exists but user was deleted — clean up
      req.session.destroy(() => {});
      throw createError("User not found.", 404);
    }
    res.json({
      id: user.id,
      shieldedAddress: user.shieldedAddress,
      createdAt: user.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/disconnect
 * Destroys the session and clears the cookie.
 */
router.post("/disconnect", requireAuth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(process.env["SESSION_NAME"] ?? "pet.sid");
    res.status(204).send();
  });
});

export default router;
