import type { Request, Response } from "express";
import { journeyService, JOURNEY_STATUSES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, validateQuery, type Schema } from "../middleware/validate.js";
import type { CompanyAuthUser } from "../middleware/auth.js";

export const startJourneySchema: Schema = {
  bus_id: { type: "integer", required: true, min: 1 },
  route_id: { type: "integer", required: true, min: 1 },
  session_id: { type: "integer", required: false, min: 1 },
};

export const endJourneySchema: Schema = {
  status: { type: "string", required: true, oneOf: ["COMPLETED", "CANCELLED"] },
};

export const listJourneysQuerySchema: Schema = {
  status: { type: "string", required: false, oneOf: JOURNEY_STATUSES as readonly string[] },
};

export const validateStartJourney = validateBody(startJourneySchema);
export const validateEndJourney = validateBody(endJourneySchema);
export const validateListJourneys = validateQuery(listJourneysQuerySchema);

function requireCompany(req: Request): CompanyAuthUser {
  const user = req.user;
  if (!user || user.role !== "COMPANY") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Company access required." } });
  }
  return user;
}

function parseJourneyId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid journey id." } });
  }
  return id;
}

export async function listJourneys(req: Request, res: Response) {
  const company = requireCompany(req);
  const status = req.query["status"] as (typeof JOURNEY_STATUSES)[number] | undefined;
  const journeys = await journeyService.listJourneys(company.id, status);
  return res.status(200).json(journeys);
}

export async function getJourneyById(req: Request, res: Response) {
  const company = requireCompany(req);
  const journey = await journeyService.getJourneyById(company.id, parseJourneyId(req));
  if (!journey) {
    throw httpError({ error: { code: "JOURNEY_NOT_FOUND", message: "Journey not found." } });
  }
  return res.status(200).json(journey);
}

export async function createJourney(req: Request, res: Response) {
  const company = requireCompany(req);
  const journey = await journeyService.createJourney({
    company_id: company.id,
    bus_id: req.body.bus_id,
    route_id: req.body.route_id,
    ...(req.body.session_id !== undefined ? { session_id: req.body.session_id } : {}),
  });
  return res.status(201).json(journey);
}

export async function endJourney(req: Request, res: Response) {
  const company = requireCompany(req);
  const journey = await journeyService.endJourney(company.id, parseJourneyId(req), {
    status: req.body.status,
  });
  if (!journey) {
    throw httpError({ error: { code: "JOURNEY_NOT_FOUND", message: "Journey not found." } });
  }
  return res.status(200).json(journey);
}

export async function deleteJourney(req: Request, res: Response) {
  const company = requireCompany(req);
  const deleted = await journeyService.deleteJourney(company.id, parseJourneyId(req));
  if (!deleted) {
    throw httpError({ error: { code: "JOURNEY_NOT_FOUND", message: "Journey not found." } });
  }
  return res.status(204).send();
}
