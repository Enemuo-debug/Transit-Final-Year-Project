import type { NextFunction, Request, Response } from "express";

const STATUS_BY_ERROR: Record<string, number> = {
  COMPANY_NAME_REQUIRED: 400,
  COMPANY_NOT_FOUND: 404,
  BUS_NOT_FOUND: 404,
  PLATE_IN_USE: 409,
  BUS_IN_USE: 409,
  BUS_ALREADY_ASSIGNED: 409,
  BUS_HAS_INCIDENTS: 409,
  BUS_ON_JOURNEY: 409,
  RESPONDER_NOT_FOUND: 404,
  LOCATION_NOT_FOUND: 404,
  BRANCH_NAME_IN_USE: 409,
  SESSION_NOT_FOUND: 404,
  SESSION_CODE_USED: 409,
  SESSION_CODE_EXPIRED: 410,
  SESSION_CODE_REVOKED: 403,
  SESSION_CODE_ACTIVE: 409,
  BUS_ALREADY_LINKED: 409,
  ROUTE_NOT_FOUND: 404,
  ROUTE_CODE_IN_USE: 409,
  ROUTE_IN_USE: 409,
  JOURNEY_NOT_FOUND: 404,
  JOURNEY_NOT_ACTIVE: 409,
  JOURNEY_NOT_COMPLETED: 409,
  NO_ACTIVE_JOURNEY: 409,
  STREAM_CONFLICT: 409,
  JOURNEY_ALREADY_ACTIVE: 409,
  BUS_IN_MAINTENANCE: 409,
  INCIDENT_NOT_FOUND: 404,
  DISPATCH_NOT_FOUND: 404,
  MAIL_NOT_CONFIGURED: 503,
  MAIL_FROM_MISSING: 500,
  INVALID_ID: 400,
  INVALID_CREDENTIALS: 401,
  INVALID_DRIVER_CREDENTIALS: 401,
  INVALID_TOKEN: 401,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  JWT_SECRET_MISSING: 500,
  VALIDATION_FAILED: 400,
  DEVICE_NOT_FOUND: 404,
  SESSION_CODE_EXHAUSTED: 500,
  MAPS_API_KEY_MISSING: 503,
  MAPS_UPSTREAM_ERROR: 502,
  MAPS_NO_RESULTS: 404,
  MAPS_LINK_INVALID: 400,
  MAPS_LINK_UNRESOLVED: 422,
  CORS_DENIED: 403,
};

export interface HttpErrorBody {
  error: {
    code: string;
    message: string;
    fields?: string[];
  };
}

export function httpError(error: HttpErrorBody): Error {
  const err = new Error(error.error.message);
  (err as unknown as { code: string }).code = error.error.code;
  return err;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  const explicitCode =
    err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;
  const code = explicitCode ?? (STATUS_BY_ERROR[message] !== undefined ? message : "INTERNAL_ERROR");

  const status = STATUS_BY_ERROR[code] ?? 500;
  const body: HttpErrorBody = {
    error: {
      code,
      message: status >= 500 ? "Unexpected server error." : message,
    },
  };
  res.status(status).json(body);
}