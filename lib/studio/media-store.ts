import { supabaseAdmin } from "@/lib/supabase/admin";

export interface MediaAsset {
  id:           string;
  projectId:    string;
  sceneIndex:   number;
  version:      number;
  url:          string;
  provider:     'kling' | 'runway' | 'fal';
  durationSecs: number;
  sizeBytes?:   number;
  mimeType:     string;
  metadata:     Record<string, unknown>;
  createdAt:    string;
}

/**
 * Append-only versioned store for generated media assets.
 * Each re-render of a scene produces a new version row — never mutates.
 */
export class MediaVersionedStore {
  async save(asset: Omit<MediaAsset, 'id' | 'createdAt'>): Promise<MediaAsset> {
    const { data, error } = await supabaseAdmin
      .from('media_assets')
      .insert({
        project_id:   asset.projectId,
        scene_index:  asset.sceneIndex,
        version:      asset.version,
        url:          asset.url,
        provider:     asset.provider,
        duration_secs: asset.durationSecs,
        size_bytes:   asset.sizeBytes ?? null,
        mime_type:    asset.mimeType,
        metadata:     asset.metadata,
      })
      .select()
      .single();

    if (error) throw new Error(`[MediaVersionedStore] save failed: ${error.message}`);
    return this.#toModel(data);
  }

  async getLatest(projectId: string, sceneIndex: number): Promise<MediaAsset | null> {
    const { data } = await supabaseAdmin
      .from('media_assets')
      .select()
      .eq('project_id', projectId)
      .eq('scene_index', sceneIndex)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    return data ? this.#toModel(data) : null;
  }

  async getHistory(projectId: string, sceneIndex: number): Promise<MediaAsset[]> {
    const { data } = await supabaseAdmin
      .from('media_assets')
      .select()
      .eq('project_id', projectId)
      .eq('scene_index', sceneIndex)
      .order('version', { ascending: false });

    return (data ?? []).map(r => this.#toModel(r));
  }

  async nextVersion(projectId: string, sceneIndex: number): Promise<number> {
    const latest = await this.getLatest(projectId, sceneIndex);
    return (latest?.version ?? 0) + 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #toModel(row: any): MediaAsset {
    return {
      id:           row.id,
      projectId:    row.project_id,
      sceneIndex:   row.scene_index,
      version:      row.version,
      url:          row.url,
      provider:     row.provider,
      durationSecs: row.duration_secs,
      sizeBytes:    row.size_bytes ?? undefined,
      mimeType:     row.mime_type,
      metadata:     row.metadata ?? {},
      createdAt:    row.created_at,
    };
  }
}
