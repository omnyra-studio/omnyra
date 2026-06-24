/**
 * Render Ledger — append-only audit trail of every clip generation attempt.
 *
 * Every frame is traceable, replayable, and versioned.
 * Uses supabaseAdmin so it bypasses RLS (internal analytics).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type RenderLedgerEntry = {
  id:              string;
  project_id:      string;
  scene_id:        string;
  snapshot_version: number;
  prompt_hash:     string;
  model_used:      "runway" | "kling" | "kling-retry";
  input_frame_url: string | null;
  output_video_url: string;
  drift_score:     number;
  retries:         number;
  generation_ms:   number;
  created_at:      string;
};

function hashPrompt(prompt: string): string {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = Math.imul(31, h) + prompt.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class RenderLedger {

  async record(entry: Omit<RenderLedgerEntry, "id" | "created_at">): Promise<void> {
    const row: RenderLedgerEntry = {
      ...entry,
      id:         crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("render_ledger")
      .insert(row);

    if (error) {
      console.warn("[RENDER_LEDGER] insert failed (non-fatal):", error.message);
    } else {
      console.log(
        `[RENDER_LEDGER] recorded scene=${entry.scene_id} model=${entry.model_used} drift=${entry.drift_score.toFixed(3)}`,
      );
    }
  }

  async getSceneHistory(sceneId: string): Promise<RenderLedgerEntry[]> {
    const { data } = await supabaseAdmin
      .from("render_ledger")
      .select("*")
      .eq("scene_id", sceneId)
      .order("created_at", { ascending: true });
    return (data ?? []) as RenderLedgerEntry[];
  }

  async getProjectHistory(projectId: string): Promise<RenderLedgerEntry[]> {
    const { data } = await supabaseAdmin
      .from("render_ledger")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    return (data ?? []) as RenderLedgerEntry[];
  }

  /** Convenience factory — builds a ledger entry from generation output. */
  static buildEntry(params: {
    projectId:      string;
    sceneId:        string;
    snapshotVersion: number;
    prompt:         string;
    modelUsed:      RenderLedgerEntry["model_used"];
    inputFrameUrl:  string | null;
    outputVideoUrl: string;
    driftScore:     number;
    retries:        number;
    generationMs:   number;
  }): Omit<RenderLedgerEntry, "id" | "created_at"> {
    return {
      project_id:       params.projectId,
      scene_id:         params.sceneId,
      snapshot_version: params.snapshotVersion,
      prompt_hash:      hashPrompt(params.prompt),
      model_used:       params.modelUsed,
      input_frame_url:  params.inputFrameUrl,
      output_video_url: params.outputVideoUrl,
      drift_score:      params.driftScore,
      retries:          params.retries,
      generation_ms:    params.generationMs,
    };
  }
}
