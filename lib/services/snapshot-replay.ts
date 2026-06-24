/**
 * Snapshot Replay System
 *
 * Every scene stores an immutable ContinuitySnapshot in the `snapshots` table.
 * This module lets you replay, diff, and debug any point in a video's timeline.
 */

import type { ContinuitySnapshot } from "@/lib/types/continuity";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface SnapshotRow {
  id: string;
  project_id: string;
  version: number;
  scene_index: number;
  snapshot_json: string;
  created_at: string;
}

export interface SceneDiff {
  cameraDrift:       number;  // 0–1
  faceDrift:         number;  // 0–1
  objectLoss:        number;  // fraction of objects that disappeared
  environmentShift:  number;  // 0–1
  overallDrift:      number;  // max of the above
  summary:           string[];
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function saveSnapshot(
  projectId: string,
  version: number,
  sceneIndex: number,
  snapshot: ContinuitySnapshot,
): Promise<void> {
  const { error } = await supabaseAdmin.from("snapshots").upsert({
    project_id:    projectId,
    version,
    scene_index:   sceneIndex,
    snapshot_json: JSON.stringify(snapshot),
  }, { onConflict: "project_id,version" });

  if (error) {
    console.error(`[SNAPSHOT_SAVE] project=${projectId} v=${version}: ${error.message}`);
  }
}

// ── Replay ────────────────────────────────────────────────────────────────────

export async function getProjectTimeline(projectId: string): Promise<SnapshotRow[]> {
  const { data, error } = await supabaseAdmin
    .from("snapshots")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: true });

  if (error) throw new Error(`Timeline fetch failed: ${error.message}`);
  return (data ?? []) as SnapshotRow[];
}

export async function replayScene(
  projectId: string,
  version: number,
): Promise<ContinuitySnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("snapshots")
    .select("snapshot_json")
    .eq("project_id", projectId)
    .eq("version", version)
    .single();

  if (error || !data) return null;
  try {
    return JSON.parse(data.snapshot_json) as ContinuitySnapshot;
  } catch {
    return null;
  }
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function compareCamera(
  c1: ContinuitySnapshot["camera"],
  c2: ContinuitySnapshot["camera"],
): number {
  let drift = 0;
  if (c1.type     !== c2.type)     drift += 0.25;
  if (c1.lens     !== c2.lens)     drift += 0.25;
  if (c1.movement !== c2.movement) drift += 0.25;
  if (Math.abs(c1.angle.yaw - c2.angle.yaw) > 10) drift += 0.25;
  return Math.min(drift, 1);
}

function compareFaces(
  chars1: ContinuitySnapshot["characters"],
  chars2: ContinuitySnapshot["characters"],
): number {
  const ids = new Set([...Object.keys(chars1), ...Object.keys(chars2)]);
  if (!ids.size) return 0;
  let driftSum = 0;
  for (const id of ids) {
    const a = chars1[id];
    const b = chars2[id];
    if (!a || !b) { driftSum += 1; continue; }
    let d = 0;
    if (a.expression !== b.expression) d += 0.3;
    if (a.pose       !== b.pose)       d += 0.4;
    if (a.gaze       !== b.gaze)       d += 0.3;
    driftSum += d;
  }
  return driftSum / ids.size;
}

function compareObjects(
  o1: ContinuitySnapshot["objects"],
  o2: ContinuitySnapshot["objects"],
): number {
  const ids = Object.keys(o1);
  if (!ids.length) return 0;
  const lost = ids.filter(id => !o2[id] || !o2[id].visibility).length;
  return lost / ids.length;
}

function compareEnv(
  e1: ContinuitySnapshot["environment"],
  e2: ContinuitySnapshot["environment"],
): number {
  let drift = 0;
  if (e1.lightingDirection !== e2.lightingDirection) drift += 0.4;
  if (e1.timeOfDay         !== e2.timeOfDay)         drift += 0.3;
  if (e1.weather           !== e2.weather)           drift += 0.3;
  return Math.min(drift, 1);
}

export async function diffScenes(
  projectId: string,
  versionA: number,
  versionB: number,
): Promise<SceneDiff | null> {
  const [s1, s2] = await Promise.all([
    replayScene(projectId, versionA),
    replayScene(projectId, versionB),
  ]);

  if (!s1 || !s2) return null;

  const cameraDrift      = compareCamera(s1.camera, s2.camera);
  const faceDrift        = compareFaces(s1.characters, s2.characters);
  const objectLoss       = compareObjects(s1.objects, s2.objects);
  const environmentShift = compareEnv(s1.environment, s2.environment);
  const overallDrift     = Math.max(cameraDrift, faceDrift, objectLoss, environmentShift);

  const summary: string[] = [];
  if (cameraDrift      > 0.2) summary.push(`camera drift: ${(cameraDrift * 100).toFixed(0)}%`);
  if (faceDrift        > 0.2) summary.push(`face/character drift: ${(faceDrift * 100).toFixed(0)}%`);
  if (objectLoss       > 0.1) summary.push(`object loss: ${(objectLoss * 100).toFixed(0)}%`);
  if (environmentShift > 0.2) summary.push(`environment shift: ${(environmentShift * 100).toFixed(0)}%`);
  if (!summary.length)        summary.push("no significant drift detected");

  return { cameraDrift, faceDrift, objectLoss, environmentShift, overallDrift, summary };
}
