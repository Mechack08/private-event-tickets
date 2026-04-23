import type { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  /** If true, the message is safe to send to the client */
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isOperational = err.isOperational ?? false;

  // Always log full error server-side
  console.error(`[error] ${err.stack ?? err.message}`);

  // Only surface operational messages to clients
  res.status(statusCode).json({
    error: isOperational ? err.message : "Internal server error",
  });
}

/** Convenience factory for operational (client-facing) errors */
export function createError(message: string, statusCode: number): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
