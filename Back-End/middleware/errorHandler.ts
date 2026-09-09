import type { NextFunction, Request, Response } from "express";

const STATUS_BY_ERROR: Record<string, number> = {
  COMPANY_NAME_REQUIRED: 400,
  COMPANY_NOT_FOUND: 404,
  BUS_NOT_FOUND: 404,
  RESPONDER_NOT_FOUND: 404,
  INVALID_ID: 400,
  INVALID_CREDENTIALS: 401,
  INVALID_TOKEN: 401,
  UNAUTHORIZED: 401,
  JWT_SECRET_MISSING: 500,
  VALIDATION_FAILED: 400,
  DEVICE_NOT_FOUND: 404,
  MAPS_API_KEY_MISSING: 503,
  MAPS_UPSTREAM_ERROR: 502,
  MAPS_NO_RESULTS: 404,
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