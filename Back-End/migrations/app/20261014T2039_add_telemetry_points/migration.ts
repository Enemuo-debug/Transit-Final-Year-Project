#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2f424e284df3a8e398ab57baabfcf8960a9269674eec5a6576602a55ef6fd7fd/contract';
import startContract from '../../snapshots/2f424e284df3a8e398ab57baabfcf8960a9269674eec5a6576602a55ef6fd7fd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/33320deb2bdfabd333bf7e89caf829b4b4d48157daae252fcedd572f6aadce6d/contract';
import endContract from '../../snapshots/33320deb2bdfabd333bf7e89caf829b4b4d48157daae252fcedd572f6aadce6d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'telemetryPoint',
        columns: [
          col('bus_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('device_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('heading', 'float8', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/float8@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('journey_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('recorded_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('speed', 'float8', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/float8@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'telemetryPoint',
        index: 'telemetryPoint_bus_id_idx_6cc9a53f',
        columns: ['bus_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'telemetryPoint',
        index: 'telemetryPoint_bus_id_recorded_at_idx_7e9d47c3',
        columns: ['bus_id', 'recorded_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'telemetryPoint',
        index: 'telemetryPoint_device_id_recorded_at_idx_c1f79609',
        columns: ['device_id', 'recorded_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'telemetryPoint',
        index: 'telemetryPoint_journey_id_recorded_at_idx_0349a7bb',
        columns: ['journey_id', 'recorded_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'telemetryPoint',
        foreignKey: {
          name: 'telemetryPoint_bus_id_fkey',
          columns: ['bus_id'],
          references: { schema: 'public', table: 'bus', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
