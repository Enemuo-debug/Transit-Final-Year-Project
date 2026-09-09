import bcrypt from "bcrypt";
import { db } from "../prisma/db.js";
import { createCompany, type CreateCompanyInput } from "./company.service.js";
import { createResponder, type CreateResponderInput } from "./responder.service.js";
import { signToken, type AuthUser, type CompanyAuthUser, type ResponderAuthUser } from "../middleware/auth.js";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

function toCompanyAuthUser(company: {
  id: number;
  email: string;
  company_name: string;
}): CompanyAuthUser {
  return {
    role: "COMPANY",
    id: company.id,
    email: company.email,
    company_name: company.company_name,
  };
}

function toResponderAuthUser(responder: {
  id: number;
  email: string;
  name: string;
  agency_type: ResponderAuthUser["agency_type"];
}): ResponderAuthUser {
  return {
    role: "RESPONDER",
    id: responder.id,
    email: responder.email,
    name: responder.name,
    agency_type: responder.agency_type,
  };
}

export async function register(input: CreateCompanyInput): Promise<AuthResult> {
  const company = await createCompany(input);
  const user = toCompanyAuthUser(company);
  return { token: signToken(user), user };
}

export async function registerResponder(input: CreateResponderInput): Promise<AuthResult> {
  const responder = await createResponder(input);
  const user = toResponderAuthUser(responder);
  return { token: signToken(user), user };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const company = await db.orm.public.Company.where({ email: input.email.trim() }).first();
  if (!company) throw new Error("INVALID_CREDENTIALS");

  const passwordMatch = await bcrypt.compare(input.password, company.password);
  if (!passwordMatch) throw new Error("INVALID_CREDENTIALS");

  const user = toCompanyAuthUser(company);
  return { token: signToken(user), user };
}

export async function loginResponder(input: LoginInput): Promise<AuthResult> {
  const responder = await db.orm.public.EmergencyResponders.where({
    email: input.email.trim(),
  }).first();
  if (!responder) throw new Error("INVALID_CREDENTIALS");

  const passwordMatch = await bcrypt.compare(input.password, responder.password);
  if (!passwordMatch) throw new Error("INVALID_CREDENTIALS");

  const user = toResponderAuthUser({
    id: responder.id,
    email: responder.email,
    name: responder.name,
    agency_type: responder.agency_type,
  });
  return { token: signToken(user), user };
}