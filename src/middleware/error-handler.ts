import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  console.error(err);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};
