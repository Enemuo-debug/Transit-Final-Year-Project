import 'dotenv/config';
import { Temporal } from 'temporal-polyfill';

(globalThis as any).Temporal = Temporal;

import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.js';
import contractJson from './contract.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
