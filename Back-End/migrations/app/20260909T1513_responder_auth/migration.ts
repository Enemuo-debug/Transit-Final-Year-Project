#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5684a7bbeb3d1a19de744f5702d0ec836e246d1ad48ab7ea85d336c0c7625827/contract';
import endContract from '../../snapshots/5684a7bbeb3d1a19de744f5702d0ec836e246d1ad48ab7ea85d336c0c7625827/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a54d464325a71a6f9b38fc3959f42d02cf99c8905de85abbb66fb152d85876a3/contract';
import startContract from '../../snapshots/a54d464325a71a6f9b38fc3959f42d02cf99c8905de85abbb66fb152d85876a3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';
import postgresStatic from '@prisma/orm-postgres/static';

const db = postgresStatic<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'emergencyResponders',
        column: col('password', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(db.context.contract, 'backfill-emergencyResponders-password', {
        check: () => db.sql.public!.emergencyResponders!
          .select('id')
          .where((f, fns) => fns.eq(f.password, null))
          .limit(1)
          .build(),
        run: () => db.sql.public!.emergencyResponders!
          .update({
            password: '$2b$10$vs4dYOYqC/IVqB.KJi9hY.s35OppYSXIVeDsQDevRPf.u1DCatpyu',
          })
          .where((f, fns) => fns.eq(f.password, null))
          .build(),
      }),
      this.setNotNull({ schema: 'public', table: 'emergencyResponders', column: 'password' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
