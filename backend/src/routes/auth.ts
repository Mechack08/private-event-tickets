import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { upsertGoogleUser, findUserById } from "../services/userService.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { createError } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { config } from "../config.js";

const router = Router();
const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

/**
 * POST /auth/google
 * Body: { credential: string } — Google ID token (JWT) from the frontend.
 *
 * Verifies the credential with Google's public keys, upserts the User row,
 * regenerates the session ID (prevents session fixation), and sets an
 * httpOnly cookie.
 */
router.post("/google", authLimiter, async (req, res, next) => {
  try {
    const { credential } = req.body as { credential?: string };
    if (!credential || typeof credential !== "string") {
      throw createError("Missing credential.", 422);
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw createError("Invalid Google token payload.", 401);
    }

    const user = await upsertGoogleUser(
      payload.sub,
      payload.email,
      payload.name,
    );

    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user.id;
      req.session.email  = user.email ?? payload.email!;

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.status(200).json({
          userId: user.id,
          email:  user.email,
          name:   user.name,
        });
      });
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 * Returns the currently authenticated user (session restore on page refresh).
 */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.session.userId!);
    if (!user) {
      req.session.destroy(() => {});
      throw createError("User not found.", 404);
    }
    res.json({
      userId: user.id,
      email:  user.email,
      name:   user.name,
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
    res.clearCookie(config.SESSION_NAME);
    res.status(204).send();
  });
});

export default router;
