#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/33320deb2bdfabd333bf7e89caf829b4b4d48157daae252fcedd572f6aadce6d/contract';
import startContract from '../../snapshots/33320deb2bdfabd333bf7e89caf829b4b4d48157daae252fcedd572f6aadce6d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/38d454a041add014ce40f7924ffa437a522cd537582101e9a1956b3468140186/contract';
import endContract from '../../snapshots/38d454a041add014ce40f7924ffa437a522cd537582101e9a1956b3468140186/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'driverSession',
        column: col('consumed_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'driverSession',
        column: col('device_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
