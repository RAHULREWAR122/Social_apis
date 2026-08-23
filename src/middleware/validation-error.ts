import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export const validationErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten().fieldErrors });
  }
  next(err);
};
