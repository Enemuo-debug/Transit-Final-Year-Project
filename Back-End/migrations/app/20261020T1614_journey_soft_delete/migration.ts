#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/38d454a041add014ce40f7924ffa437a522cd537582101e9a1956b3468140186/contract';
import startContract from '../../snapshots/38d454a041add014ce40f7924ffa437a522cd537582101e9a1956b3468140186/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c752030ccabb881f22405a706d8b458de2510ecc5cafdf713863cfafb8d8800e/contract';
import endContract from '../../snapshots/c752030ccabb881f22405a706d8b458de2510ecc5cafdf713863cfafb8d8800e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'journey',
        column: col('deleted_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
