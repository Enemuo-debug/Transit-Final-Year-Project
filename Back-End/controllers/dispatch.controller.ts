import type { Request, Response } from "express";
import { dispatchService, DISPATCH_STATUSES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";
import type { CompanyAuthUser, ResponderAuthUser } from "../middleware/auth.js";

export const updateDispatchSchema: Schema = {
  status: { type: "string", required: true, oneOf: DISPATCH_STATUSES as readonly string[] },
  notes: { type: "string", required: false, maxLength: 500 },
};

export const validateUpdateDispatch = validateBody(updateDispatchSchema);

function requireResponder(req: Request): ResponderAuthUser {
  const user = req.user;
  if (!user || user.role !== "RESPONDER") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Responder access required." } });
  }
  return user;
}

function requireCompany(req: Request): CompanyAuthUser {
  const user = req.user;
  if (!user || user.role !== "COMPANY") {
    throw httpError({ error: { code: "FORBIDDEN", message: "Company access required." } });
  }
  return user;
}

function parseDispatchId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid dispatch id." } });
  }
  return id;
}

export async function listMyDispatches(req: Request, res: Response) {
  const responder = requireResponder(req);
  const dispatches = await dispatchService.listDispatchesByResponder(responder.id);
  return res.status(200).json(dispatches);
}

export async function updateDispatchStatus(req: Request, res: Response) {
  const responder = requireResponder(req);
  const dispatch = await dispatchService.updateDispatchStatus(
    responder.id,
    parseDispatchId(req),
    req.body.status,
  );
  if (!dispatch) {
    throw httpError({ error: { code: "DISPATCH_NOT_FOUND", message: "Dispatch not found." } });
  }
  return res.status(200).json(dispatch);
}

export async function getIncidentDispatches(req: Request, res: Response) {
  const company = requireCompany(req);
  const incidentId = Number(req.params["incidentId"]);
  if (!Number.isInteger(incidentId) || incidentId <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid incident id." } });
  }
  const dispatches = await dispatchService.listDispatchesByIncident(company.id, incidentId);
  if (!dispatches) {
    throw httpError({ error: { code: "INCIDENT_NOT_FOUND", message: "Incident not found." } });
  }
  return res.status(200).json(dispatches);
}
