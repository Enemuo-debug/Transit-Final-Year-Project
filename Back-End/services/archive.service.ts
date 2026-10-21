import { db } from "../prisma/db.js";

export type ArchiveEntityType = "JOURNEY" | "ROUTE" | "BUS";

export interface ArchiveInput {
  entity_type: ArchiveEntityType;
  entity_id: number;
  company_id?: number | null;
  snapshot: unknown;
  deleted_by?: string;
}

/**
 * Append-only audit trail for hard-deleted records. This table is never purged
 * by the application, so historical journeys/routes/vehicles can be reviewed
 * (e.g. by government intelligence) even after removal from the live tables.
 */
export async function archiveRecord(input: ArchiveInput): Promise<void> {
  await db.orm.public.ArchivedRecord.create({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    company_id: input.company_id ?? null,
    snapshot: JSON.stringify(input.snapshot),
    deleted_by: input.deleted_by ?? null,
  });
}

export async function listArchivedRecords(
  company_id: number,
  entity_type?: ArchiveEntityType,
): Promise<Array<{
  id: number;
  entity_type: string;
  entity_id: number;
  company_id: number | null;
  snapshot: string;
  deleted_by: string | null;
  deleted_at: Date;
}>> {
  const rows = await db.orm.public.ArchivedRecord.where({ company_id }).all();
  const filtered = entity_type ? rows.filter((r) => r.entity_type === entity_type) : rows;
  return filtered.sort(
    (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
  );
}
