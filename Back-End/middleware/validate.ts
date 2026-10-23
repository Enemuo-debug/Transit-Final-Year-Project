import type { NextFunction, Request, RequestHandler, Response } from "express";

export type FieldRule = {
  type?: "string" | "number" | "integer" | "boolean" | "email";
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  oneOf?: readonly (string | number)[];
  pattern?: RegExp;
  trim?: boolean;
};

export type Schema = Record<string, FieldRule>;

type Source = "body" | "query" | "params";

function applyTrim(value: string, rule: FieldRule): string {
  return rule.trim === false ? value : value.trim();
}

function validateField(field: string, value: unknown, rule: FieldRule): string | null {
  const present = value !== undefined && value !== null && value !== "";

  if (!present) {
    if (rule.required) return `${field} is required`;
    return null;
  }

  if (rule.type === "email") {
    if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return `${field} must be a valid email`;
    }
    return null;
  }

  if (rule.type === "boolean") {
    if (typeof value !== "boolean") return `${field} must be a boolean`;
    return null;
  }

  if (rule.type === "number" || rule.type === "integer") {
    const num = typeof value === "string" ? Number(value) : value;
    if (typeof num !== "number" || !Number.isFinite(num)) return `${field} must be a number`;
    if (rule.type === "integer" && !Number.isInteger(num)) return `${field} must be an integer`;
    if (rule.min !== undefined && num < rule.min) return `${field} must be at least ${rule.min}`;
    if (rule.max !== undefined && num > rule.max) return `${field} must be at most ${rule.max}`;
    return null;
  }

  const str = typeof value === "string" ? applyTrim(value, rule) : String(value);
  if (rule.minLength !== undefined && str.length < rule.minLength) {
    return `${field} must be at least ${rule.minLength} characters`;
  }
  if (rule.maxLength !== undefined && str.length > rule.maxLength) {
    return `${field} must be at most ${rule.maxLength} characters`;
  }
  if (rule.oneOf !== undefined && !rule.oneOf.includes(str as never)) {
    return `${field} must be one of: ${rule.oneOf.join(", ")}`;
  }
  if (rule.pattern !== undefined && !rule.pattern.test(str)) return `${field} is not valid`;

  return null;
}

export function validate(schema: Schema, source: Source = "body"): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = (req[source] ?? {}) as Record<string, unknown>;
    const errors: string[] = [];

    for (const [field, rule] of Object.entries(schema)) {
      const error = validateField(field, data[field], rule);
      if (error) errors.push(error);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message: `Invalid ${source}`,
          fields: errors,
        },
      });
    }

    return next();
  };
}

export const validateBody = (schema: Schema): RequestHandler => validate(schema, "body");
export const validateQuery = (schema: Schema): RequestHandler => validate(schema, "query");
export const validateParams = (schema: Schema): RequestHandler => validate(schema, "params");