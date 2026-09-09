import type { Request, Response } from "express";
import { companyService } from "../services/index.js";
import { httpError } from "../middleware/errorHandler.js";
import { validateBody, type Schema } from "../middleware/validate.js";

export const createCompanySchema: Schema = {
  email: { type: "email", required: true, maxLength: 254 },
  company_name: { type: "string", required: true, minLength: 1, maxLength: 200 },
  password: { type: "string", required: true, minLength: 6, maxLength: 100 },
};

export const updateCompanySchema: Schema = {
  email: { type: "email", required: false, maxLength: 254 },
  company_name: { type: "string", required: false, minLength: 1, maxLength: 200 },
  password: { type: "string", required: false, minLength: 6, maxLength: 100 },
};

export const validateCreateCompany = validateBody(createCompanySchema);
export const validateUpdateCompany = validateBody(updateCompanySchema);

export function parseCompanyId(req: Request): number {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) throw httpError({ error: { code: "INVALID_ID", message: "Invalid company id." } });
  return id;
}

export async function getAllCompanies(_req: Request, res: Response) {
  const companies = await companyService.getAllCompanies();
  return res.status(200).json(companies);
}

export async function getCompanyById(req: Request, res: Response) {
  const company = await companyService.getCompanyById(parseCompanyId(req));
  if (!company) throw httpError({ error: { code: "COMPANY_NOT_FOUND", message: "Company not found." } });
  return res.status(200).json(company);
}

export async function createCompany(req: Request, res: Response) {
  const company = await companyService.createCompany(req.body);
  return res.status(201).json(company);
}

export async function updateCompany(req: Request, res: Response) {
  const company = await companyService.updateCompany(parseCompanyId(req), req.body);
  if (!company) throw httpError({ error: { code: "COMPANY_NOT_FOUND", message: "Company not found." } });
  return res.status(200).json(company);
}

export async function deleteCompany(req: Request, res: Response) {
  const deleted = await companyService.deleteCompany(parseCompanyId(req));
  if (!deleted) throw httpError({ error: { code: "COMPANY_NOT_FOUND", message: "Company not found." } });
  return res.status(204).send();
}