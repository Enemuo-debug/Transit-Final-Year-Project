import bcrypt from "bcrypt";
import { db } from "../prisma/db.js";

const SALT_ROUNDS = 10;

export interface CreateCompanyInput {
  email: string;
  company_name: string;
  password: string;
}

export interface UpdateCompanyInput {
  email?: string;
  company_name?: string;
  password?: string;
}

function stripPassword<T extends { password?: unknown }>(row: T): Omit<T, "password"> {
  const { password: _, ...rest } = row;
  return rest;
}

export async function getAllCompanies() {
  const companies = await db.orm.public.Company
    .include("buses", (b) => b)
    .all();
  return companies.map(stripPassword);
}

export async function getCompanyById(id: number) {
  const company = await db.orm.public.Company
    .include("buses", (b) => b)
    .where({ id })
    .first();
  if (!company) return null;
  return stripPassword(company);
}

export async function createCompany(input: CreateCompanyInput) {
  if (!input.company_name?.trim()) throw new Error("COMPANY_NAME_REQUIRED");
  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  const company = await db.orm.public.Company.create({
    email: input.email.trim(),
    company_name: input.company_name.trim(),
    password: hashed,
  });
  return stripPassword(company);
}

export async function updateCompany(id: number, input: UpdateCompanyInput) {
  const existing = await db.orm.public.Company.where({ id }).first();
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (input.email !== undefined && input.email.trim().length > 0) data.email = input.email.trim();
  if (input.company_name !== undefined) {
    if (!input.company_name.trim()) throw new Error("COMPANY_NAME_REQUIRED");
    data.company_name = input.company_name.trim();
  }
  if (input.password !== undefined && input.password.trim().length > 0) {
    data.password = await bcrypt.hash(input.password, SALT_ROUNDS);
  }

  if (Object.keys(data).length === 0) return stripPassword(existing);

  const updated = await db.orm.public.Company.where({ id }).update(data);
  if (!updated) return null;
  return stripPassword(updated);
}

export async function deleteCompany(id: number) {
  const deleted = await db.orm.public.Company.where({ id }).delete();
  return deleted !== null;
}
