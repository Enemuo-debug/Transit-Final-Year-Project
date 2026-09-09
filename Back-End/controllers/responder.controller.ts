import type { Request, Response } from "express";
import { responderService, AGENCY_TYPES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";

export const createResponderSchema: Schema = {
  name: { type: "string", required: true, minLength: 1, maxLength: 100 },
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "string", required: true, minLength: 6, maxLength: 100 },
  agency_type: { type: "string", required: true, oneOf: AGENCY_TYPES as readonly string[] },
};

export const updateResponderSchema: Schema = {
  name: { type: "string", required: false, minLength: 1, maxLength: 100 },
  email: { type: "email", required: false, maxLength: 254 },
  password: { type: "string", required: false, minLength: 6, maxLength: 100 },
  agency_type: { type: "string", required: false, oneOf: AGENCY_TYPES as readonly string[] },
};

export const validateCreateResponder = validateBody(createResponderSchema);
export const validateUpdateResponder = validateBody(updateResponderSchema);

export function parseResponderId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError({ error: { code: "INVALID_ID", message: "Invalid responder id." } });
  }
  return id;
}

export async function getAllResponders(_req: Request, res: Response) {
  const responders = await responderService.getAllResponders();
  return res.status(200).json(responders);
}

export async function getResponderById(req: Request, res: Response) {
  const responder = await responderService.getResponderById(parseResponderId(req));
  if (!responder) {
    throw httpError({ error: { code: "RESPONDER_NOT_FOUND", message: "Responder not found." } });
  }
  return res.status(200).json(responder);
}

export async function createResponder(req: Request, res: Response) {
  const responder = await responderService.createResponder(req.body);
  return res.status(201).json(responder);
}

export async function updateResponder(req: Request, res: Response) {
  const responder = await responderService.updateResponder(parseResponderId(req), req.body);
  if (!responder) {
    throw httpError({ error: { code: "RESPONDER_NOT_FOUND", message: "Responder not found." } });
  }
  return res.status(200).json(responder);
}

export async function deleteResponder(req: Request, res: Response) {
  const deleted = await responderService.deleteResponder(parseResponderId(req));
  if (!deleted) {
    throw httpError({ error: { code: "RESPONDER_NOT_FOUND", message: "Responder not found." } });
  }
  return res.status(204).send();
}