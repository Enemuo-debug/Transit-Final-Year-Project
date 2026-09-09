import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "../prisma/db.js";
import { AGENCY_TYPES, type AgencyType } from "../services/responder.service.js";

export type AuthRole = "COMPANY" | "RESPONDER";

export interface CompanyAuthUser {
  role: AuthRole;
  id: number;
  email: string;
  company_name: string;
}

export interface ResponderAuthUser {
  role: AuthRole;
  id: number;
  email: string;
  name: string;
  agency_type: AgencyType;
}

export type AuthUser = CompanyAuthUser | ResponderAuthUser;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const TOKEN_TTL = "7d";

export { AGENCY_TYPES };

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET_MISSING");
  return secret;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, getJwtSecret(), {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): { id: number; role: AuthRole } {
  const payload = jwt.verify(token, getJwtSecret());
  if (typeof payload === "string") throw new Error("INVALID_TOKEN");
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) throw new Error("INVALID_TOKEN");
  const role = (payload.role as AuthRole | undefined) ?? null;
  if (role !== "COMPANY" && role !== "RESPONDER") throw new Error("INVALID_TOKEN");
  return { id, role };
}

function readBearerToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (!header || typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export const authenticate: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing bearer token. Send `Authorization: Bearer <token>`.",
      },
    });
  }

  let payload: { id: number; role: AuthRole };
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Invalid or expired token." },
    });
  }

  if (payload.role === "COMPANY") {
    const company = await db.orm.public.Company.where({ id: payload.id }).first();
    if (!company) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Account no longer exists." },
      });
    }
    req.user = {
      role: "COMPANY",
      id: company.id,
      email: company.email,
      company_name: company.company_name,
    };
  } else {
    const responder = await db.orm.public.EmergencyResponders.where({ id: payload.id }).first();
    if (!responder) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Account no longer exists." },
      });
    }
    req.user = {
      role: "RESPONDER",
      id: responder.id,
      email: responder.email,
      name: responder.name,
      agency_type: responder.agency_type,
    };
  }

  return next();
};