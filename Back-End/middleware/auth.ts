import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "../prisma/db.js";
import { type AgencyType } from "../services/responder.service.js";

export type AuthRole = "COMPANY" | "RESPONDER" | "DRIVER";

export interface CompanyAuthUser {
  role: "COMPANY";
  id: number;
  email: string;
  company_name: string;
}

export interface ResponderAuthUser {
  role: "RESPONDER";
  id: number;
  email: string;
  name: string;
  agency_type: AgencyType;
}

export interface DriverAuthUser {
  role: "DRIVER";
  sessionId: number;
  companyId: number;
  plate_number: string;
  busId: number;
  session_code: string;
  deviceId?: string;
}

export type AuthUser = CompanyAuthUser | ResponderAuthUser | DriverAuthUser;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const TOKEN_TTL = "7d";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET_MISSING");
  return secret;
}

export function signToken(user: AuthUser): string {
  const sub = user.role === "DRIVER" ? String(user.sessionId) : String(user.id);
  const payload: Record<string, unknown> = { sub, role: user.role };
  if (user.role === "DRIVER" && user.deviceId) payload["deviceId"] = user.deviceId;
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): { id: number; role: AuthRole; deviceId?: string } {
  const payload = jwt.verify(token, getJwtSecret());
  if (typeof payload === "string") throw new Error("INVALID_TOKEN");
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) throw new Error("INVALID_TOKEN");
  const role = (payload.role as AuthRole | undefined) ?? null;
  if (role !== "COMPANY" && role !== "RESPONDER" && role !== "DRIVER") throw new Error("INVALID_TOKEN");
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : undefined;
  return { id, role, ...(deviceId !== undefined ? { deviceId } : {}) };
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
  } else if (payload.role === "RESPONDER") {
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
  } else {
    const session = await db.orm.public.DriverSession.where({ id: payload.id }).first();
    if (!session || !session.is_active) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Session no longer active." },
      });
    }
    const bus = await db.orm.public.Bus.where({ plate_number: session.plate_number }).first();
    if (!bus || bus.deleted_at !== null) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Session has no bus assigned." },
      });
    }
    req.user = {
      role: "DRIVER",
      sessionId: session.id,
      companyId: session.company_id,
      plate_number: bus.plate_number,
      busId: bus.id,
      session_code: session.session_code,
      ...(session.device_id !== null && session.device_id !== undefined
        ? { deviceId: session.device_id }
        : {}),
    };
  }

  return next();
};