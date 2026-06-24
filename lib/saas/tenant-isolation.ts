import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * TenantIsolation — ensures every data access is scoped to the requesting user.
 *
 * Call assertOwnership() at the start of any route that loads a resource by ID.
 * Throws 403 if the user doesn't own it — prevents IDOR vulnerabilities.
 */
export class TenantIsolation {
  async assertOwnership(params: {
    userId:    string;
    table:     string;
    id:        string;
    ownerCol?: string;
  }): Promise<void> {
    const ownerCol = params.ownerCol ?? 'user_id';
    const { data } = await supabaseAdmin
      .from(params.table)
      .select(ownerCol)
      .eq('id', params.id)
      .single();

    if (!data) throw Object.assign(new Error('Not found'), { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((data as any)[ownerCol] !== params.userId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
  }

  /** Scopes a select query so results are always filtered by owner. */
  scopedSelect(userId: string, table: string) {
    return supabaseAdmin.from(table).select().eq('user_id', userId);
  }

  /** Validates that a set of IDs all belong to the user before bulk operations. */
  async assertBulkOwnership(params: {
    userId:    string;
    table:     string;
    ids:       string[];
    ownerCol?: string;
  }): Promise<void> {
    const ownerCol = params.ownerCol ?? 'user_id';
    const { data } = await supabaseAdmin
      .from(params.table)
      .select(`id, ${ownerCol}`)
      .in('id', params.ids);

    const rows = data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forbidden = rows.filter(r => (r as any)[ownerCol] !== params.userId);
    if (forbidden.length > 0) {
      throw Object.assign(
        new Error(`Forbidden: ${forbidden.length} resource(s) not owned by user`),
        { status: 403 },
      );
    }
    const found = rows.map(r => (r as unknown as { id: string }).id);
    const missing = params.ids.filter(id => !found.includes(id));
    if (missing.length > 0) {
      throw Object.assign(new Error(`Not found: ${missing.join(', ')}`), { status: 404 });
    }
  }
}

export const tenantIsolation = new TenantIsolation();
