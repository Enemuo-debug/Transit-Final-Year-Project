#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5f78233b07082a5f5b787aad177166d5d62b9eb7b394d289b3f5b66828f93a4c/contract';
import startContract from '../../snapshots/5f78233b07082a5f5b787aad177166d5d62b9eb7b394d289b3f5b66828f93a4c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/a54d464325a71a6f9b38fc3959f42d02cf99c8905de85abbb66fb152d85876a3/contract';
import endContract from '../../snapshots/a54d464325a71a6f9b38fc3959f42d02cf99c8905de85abbb66fb152d85876a3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';
import postgresStatic from '@prisma/orm-postgres/static';

const db = postgresStatic<End>({ contractJson: endContract });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dataTransform(db.context.contract, 'handle-nulls-company-company_name', {
        check: () => db.sql.public!.company!
          .select('id')
          .where((f, fns) => fns.eq(f.company_name, null))
          .limit(1)
          .build(),
        run: () => db.sql.public!.company!
          .update({ company_name: 'Unknown' })
          .where((f, fns) => fns.eq(f.company_name, null))
          .build(),
      }),
      this.setNotNull({ schema: 'public', table: 'company', column: 'company_name' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
