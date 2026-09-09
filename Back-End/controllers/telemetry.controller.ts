import type { Request, Response } from "express";
import { telemetryService } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateQuery, type Schema } from "../middleware/validate.js";

export const liveQuerySchema: Schema = {};

export const validateLiveQuery = validateQuery(liveQuerySchema);

export async function getLivePositions(_req: Request, res: Response) {
  const positions = telemetryService.getLivePositions();
  return res.status(200).json({ count: positions.length, positions });
}

export async function getLivePositionById(req: Request, res: Response) {
  const deviceId = String(req.params["deviceId"] ?? "");
  if (!deviceId) throw httpError({ error: { code: "INVALID_ID", message: "Missing device id." } });
  const position = telemetryService.getLivePosition(deviceId);
  if (!position) {
    throw httpError({
      error: { code: "DEVICE_NOT_FOUND", message: "No live position for this device." },
    });
  }
  return res.status(200).json(position);
}