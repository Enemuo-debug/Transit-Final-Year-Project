#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5f78233b07082a5f5b787aad177166d5d62b9eb7b394d289b3f5b66828f93a4c/contract';
import endContract from '../../snapshots/5f78233b07082a5f5b787aad177166d5d62b9eb7b394d289b3f5b66828f93a4c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'bus',
        columns: [
          col('capacity', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('company_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('plate_number', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reg_date', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('OFFLINE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'bus_status_check_e23d3ba9',
            "\"status\" IN ('ACTIVE', 'MAINTENANCE', 'OFFLINE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'company',
        columns: [
          col('company_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'emergencyResponders',
        columns: [
          col('agency_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'emergencyResponders_agency_type_check_62d1a73a',
            "\"agency_type\" IN ('POLICE', 'FRSC', 'NEMA', 'MEDICAL')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'bus',
        constraint: 'bus_plate_number_key',
        columns: ['plate_number'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'company',
        constraint: 'company_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'emergencyResponders',
        constraint: 'emergencyResponders_name_key',
        columns: ['name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'emergencyResponders',
        constraint: 'emergencyResponders_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'bus',
        index: 'bus_company_id_idx_1303a718',
        columns: ['company_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'bus',
        foreignKey: {
          name: 'bus_company_id_fkey',
          columns: ['company_id'],
          references: { schema: 'public', table: 'company', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
