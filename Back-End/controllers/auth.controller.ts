import type { Request, Response } from "express";
import { authService } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";

export const registerSchema: Schema = {
  email: { type: "email", required: true, maxLength: 254 },
  company_name: { type: "string", required: true, minLength: 1, maxLength: 200 },
  password: { type: "string", required: true, minLength: 6, maxLength: 100 },
};

export const registerResponderSchema: Schema = {
  name: { type: "string", required: true, minLength: 1, maxLength: 100 },
  email: { type: "email", required: true, maxLength: 254 },
  password: { type: "string", required: true, minLength: 6, maxLength: 100 },
  agency_type: {
    type: "string",
    required: true,
    oneOf: ["POLICE", "FRSC", "NEMA", "MEDICAL"] as readonly string[],
  },
};

export const loginSchema: Schema = {
  email: { type: "email", required: true },
  password: { type: "string", required: true, minLength: 1 },
};

export const validateRegister = validateBody(registerSchema);
export const validateRegisterResponder = validateBody(registerResponderSchema);
export const validateLogin = validateBody(loginSchema);

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body);
  return res.status(201).json(result);
}

export async function registerResponder(req: Request, res: Response) {
  const result = await authService.registerResponder(req.body);
  return res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body);
  return res.status(200).json(result);
}

export async function loginResponder(req: Request, res: Response) {
  const result = await authService.loginResponder(req.body);
  return res.status(200).json(result);
}

export async function me(req: Request, res: Response) {
  if (!req.user) throw httpError({ error: { code: "UNAUTHORIZED", message: "Not authenticated." } });
  return res.status(200).json({ user: req.user });
}