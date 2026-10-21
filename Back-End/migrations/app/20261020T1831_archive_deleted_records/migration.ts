#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/68da671daa93ac543462235f1015fef77265069a4d92b3e2bad1f732b1b3f9ec/contract';
import startContract from '../../snapshots/68da671daa93ac543462235f1015fef77265069a4d92b3e2bad1f732b1b3f9ec/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9d2479f45ec47bee6cb6dd5af9b0cf9419d2b51146da0d00a37a1b6a68c93477/contract';
import endContract from '../../snapshots/9d2479f45ec47bee6cb6dd5af9b0cf9419d2b51146da0d00a37a1b6a68c93477/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'bus',
        constraint: 'bus_status_check_e23d3ba9',
      }),
      this.createTable({
        schema: 'public',
        table: 'archivedRecord',
        columns: [
          col('company_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('deleted_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_by', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('entity_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('entity_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('snapshot', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'bus',
        constraint: 'bus_status_check_5c124e77',
        expression: "\"status\" IN ('ACTIVE', 'ON_JOURNEY', 'MAINTENANCE', 'OFFLINE')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'archivedRecord',
        index: 'archivedRecord_company_id_deleted_at_idx_5ecd9cd3',
        columns: ['company_id', 'deleted_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'archivedRecord',
        index: 'archivedRecord_entity_type_entity_id_idx_4cde03a1',
        columns: ['entity_type', 'entity_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
