import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";
import { verifyAccessToken } from "../utils/jwt";
import { OrgRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        role: OrgRole;
      };
    }
  }
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or invalid authorization header");
  }

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.auth = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role as OrgRole,
    };
    next();
  } catch {
    throw new HttpError(401, "Invalid or expired access token");
  }
};

export const requireRole = (...roles: OrgRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw new HttpError(403, "You do not have permission to perform this action");
    }
    next();
  };
};
