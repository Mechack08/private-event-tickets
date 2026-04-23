// Augment express-session's Session type so req.session.userId is typed.
import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: string;
    shieldedAddress: string;
  }
}
