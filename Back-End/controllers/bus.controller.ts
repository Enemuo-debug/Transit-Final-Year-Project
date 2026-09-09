import type { Request, Response } from "express";
import { busService, BUS_STATUSES } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";

export const createBusSchema: Schema = {
  company_id: { type: "integer", required: true, min: 1 },
  plate_number: { type: "string", required: true, minLength: 1, maxLength: 20 },
  capacity: { type: "integer", required: true, min: 1, max: 100 },
  status: { type: "string", required: false, oneOf: BUS_STATUSES as readonly string[] },
};

export const updateBusSchema: Schema = {
  company_id: { type: "integer", required: false, min: 1 },
  plate_number: { type: "string", required: false, minLength: 1, maxLength: 20 },
  capacity: { type: "integer", required: false, min: 1, max: 100 },
  status: { type: "string", required: false, oneOf: BUS_STATUSES as readonly string[] },
};

export const validateCreateBus = validateBody(createBusSchema);
export const validateUpdateBus = validateBody(updateBusSchema);

export function parseBusId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) throw httpError({ error: { code: "INVALID_ID", message: "Invalid bus id." } });
  return id;
}

export async function getAllBuses(_req: Request, res: Response) {
  const buses = await busService.getAllBuses();
  return res.status(200).json(buses);
}

export async function getBusById(req: Request, res: Response) {
  const bus = await busService.getBusById(parseBusId(req));
  if (!bus) throw httpError({ error: { code: "BUS_NOT_FOUND", message: "Bus not found." } });
  return res.status(200).json(bus);
}

export async function createBus(req: Request, res: Response) {
  const bus = await busService.createBus(req.body);
  return res.status(201).json(bus);
}

export async function updateBus(req: Request, res: Response) {
  const bus = await busService.updateBus(parseBusId(req), req.body);
  if (!bus) throw httpError({ error: { code: "BUS_NOT_FOUND", message: "Bus not found." } });
  return res.status(200).json(bus);
}

export async function deleteBus(req: Request, res: Response) {
  const deleted = await busService.deleteBus(parseBusId(req));
  if (!deleted) throw httpError({ error: { code: "BUS_NOT_FOUND", message: "Bus not found." } });
  return res.status(204).send();
}