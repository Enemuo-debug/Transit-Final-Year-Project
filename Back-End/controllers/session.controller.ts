import type { Request, Response } from "express";
import { sessionService } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";

export const createSessionSchema: Schema = {
  plate_number: { type: "string", required: true, minLength: 1, maxLength: 20 },
};

export const validateCreateSession = validateBody(createSessionSchema);

function requireCompany(req: Request): { id: number } {
  const user = req.user;
  if (!user || user.role !== "COMPANY") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Company access required." } });
  }
  return { id: user.id };
}

function parseSessionId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid session id." } });
  }
  return id;
}

export async function createSession(req: Request, res: Response) {
  const company = requireCompany(req);
  const session = await sessionService.createSession({
    company_id: company.id,
    plate_number: req.body.plate_number,
  });
  return res.status(201).json(session);
}

export async function listSessions(req: Request, res: Response) {
  const company = requireCompany(req);
  const sessions = await sessionService.getSessionsByCompany(company.id);
  return res.status(200).json({ sessions });
}

export async function deactivateSession(req: Request, res: Response) {
  const company = requireCompany(req);
  const session = await sessionService.deactivateSession(company.id, parseSessionId(req));
  if (!session) {
    throw httpError({ error: { code: "SESSION_NOT_FOUND", message: "Session not found." } });
  }
  return res.status(200).json(session);
}