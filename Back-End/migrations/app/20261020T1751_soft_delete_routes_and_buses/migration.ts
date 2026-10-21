#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/68da671daa93ac543462235f1015fef77265069a4d92b3e2bad1f732b1b3f9ec/contract';
import endContract from '../../snapshots/68da671daa93ac543462235f1015fef77265069a4d92b3e2bad1f732b1b3f9ec/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c752030ccabb881f22405a706d8b458de2510ecc5cafdf713863cfafb8d8800e/contract';
import startContract from '../../snapshots/c752030ccabb881f22405a706d8b458de2510ecc5cafdf713863cfafb8d8800e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'bus',
        column: col('deleted_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'route',
        column: col('deleted_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
