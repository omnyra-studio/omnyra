/**
 * Cinema Pipeline Orchestrator
 *
 * Full flow:
 *   Ghost EI (upstream, already applied to idea/script)
 *   → Beat Director       (AI: structured story beats + narration)
 *   → Shot Planner        (local: professional shot assignment, camera evolution)
 *   → Story Validator     (local: arc advancement check, auto-repair)
 *   → Repetition Detector (local: duplicate detection, auto-repair)
 *   → Scene Graph Builder (local: assembles graph nodes)
 *   → Prompt Compiler     (local: RenderContracts — never raw script)
 *
 * Returns CinemaPipelineResult consumed by the cinematic route.
 */

import { generateCinematicBeats }              from "./beat-director";
import { planShots }                            from "./shot-planner";
import { detectRepetitions, repairRepetitions } from "./repetition-detector";
import { validateStoryArc, repairStoryArc }     from "./story-validator";
import { compileRenderContracts }               from "./prompt-compiler";
import { deriveDirectorIntent }                 from "./director-intent";
import { planFilmRhythm }                       from "./film-rhythm";
import { scanVisualMotifs }                     from "./visual-motif";
import { buildEditingPlan, describeEditingPlan } from "./editing-planner";
import { scoreContracts }                       from "./continuity-confidence";
import type {
  CinematicBeat, ShotPlan, NarrationBeat,
  SceneGraphNode, CinemaPipelineResult,
  DirectorIntent, SceneRhythm, VisualMotif, EditingPlan, ContinuityConfidence,
} from "./types";
import type { NicheSettings } from "@/lib/config/nicheSettings";
import type { StoryBeat }     from "@/lib/storyboard-planner";

export interface CinemaPipelineParams {
  idea:         string;
  script?:      string;
  niche:        string;
  sceneCount:   number;
  nicheSettings: NicheSettings;
}

export async function runCinemaPipeline(
  params: CinemaPipelineParams,
): Promise<CinemaPipelineResult> {
  const { idea, script, niche, sceneCount, nicheSettings } = params;

  const pipelineStart = Date.now();
  const report: string[] = [];

  // ── 0. Director Intent ────────────────────────────────────────────────────
  let intent: DirectorIntent | undefined;
  try {
    intent = await deriveDirectorIntent({ idea, niche, nicheSettings });
    report.push(`intent:${intent.genre}/${intent.pace}/${intent.ending}`);
  } catch (err) {
    console.warn('[PIPELINE] DirectorIntent failed, continuing without:', err instanceof Error ? err.message : err);
  }

  // ── 1. Beat Director ──────────────────────────────────────────────────────
  let beats = await generateCinematicBeats({
    idea, script, niche, sceneCount, nicheSettings, intent,
  });
  report.push(`beats=${beats.length}`);

  // ── 1b. Film Rhythm ───────────────────────────────────────────────────────
  let rhythms: SceneRhythm[] = [];
  if (intent) {
    rhythms = planFilmRhythm(beats, intent);
    report.push(`rhythm:${rhythms.map(r => r.pace[0]).join('')}`); // e.g. "ssmff"
  }

  // ── 2. Shot Planner ───────────────────────────────────────────────────────
  let shots = planShots(beats);
  report.push(`shots=${shots.length}`);

  // ── 3. Story Validation + Repair ─────────────────────────────────────────
  const validationResults = validateStoryArc(beats);
  const failedValidations = validationResults.filter(r => !r.passed);
  if (failedValidations.length > 0) {
    beats = repairStoryArc(beats, validationResults);
    report.push(`story_repairs=${failedValidations.length}`);
  }

  // ── 2b. Visual Motifs ─────────────────────────────────────────────────────
  let motifs: VisualMotif[] = [];
  try {
    motifs = scanVisualMotifs(beats);
    if (motifs.length > 0) report.push(`motifs=${motifs.length}`);
  } catch (err) {
    console.warn('[PIPELINE] VisualMotifs failed:', err instanceof Error ? err.message : err);
  }

  // ── 4. Repetition Detection + Repair ─────────────────────────────────────
  const repetitionFlags = detectRepetitions(beats, shots);
  if (repetitionFlags.length > 0) {
    beats = repairRepetitions(beats, repetitionFlags);
    shots = planShots(beats); // replan shots after beat repairs
    report.push(`repetition_repairs=${repetitionFlags.length}`);
  }

  // ── 5. Narration Extraction ───────────────────────────────────────────────
  const narrations = buildNarrations(beats, script);
  const compositeNarration = buildCompositeNarration(narrations);
  report.push(`narrationChars=${compositeNarration.length}`);

  // ── 6. Scene Graph Assembly ───────────────────────────────────────────────
  const sceneGraph = assembleSceneGraph(beats, shots, narrations);

  // ── 7. Prompt Compilation ─────────────────────────────────────────────────
  const renderContracts = compileRenderContracts(sceneGraph);

  // Attach contracts back to graph nodes
  for (let i = 0; i < sceneGraph.length; i++) {
    sceneGraph[i].renderContract = renderContracts[i] ?? null;
    sceneGraph[i].validationStatus = validationResults[i]?.passed ? 'passed' : 'repaired';
  }

  // ── 7b. Editing Plan ──────────────────────────────────────────────────────
  let editingPlan: EditingPlan | undefined;
  if (rhythms.length > 0) {
    editingPlan = buildEditingPlan(beats, rhythms);
    report.push(`editing:${describeEditingPlan(editingPlan)}`);
  }

  // ── 7c. Continuity Confidence Gate ────────────────────────────────────────
  let continuityScores: ContinuityConfidence[] | undefined;
  try {
    continuityScores = scoreContracts(renderContracts);
    const failing = continuityScores.filter(s => !s.pass);
    if (failing.length > 0) {
      report.push(`continuity_failures=${failing.length}(${failing.map(s => s.beatIndex + 1).join(',')})`);
    } else {
      report.push(`continuity=pass`);
    }
  } catch (err) {
    console.warn('[PIPELINE] ContinuityConfidence failed:', err instanceof Error ? err.message : err);
  }

  const elapsed = Date.now() - pipelineStart;
  console.log(`[CINEMA_PIPELINE] done in ${elapsed}ms — ${report.join(' | ')}`);

  return {
    beats,
    shots,
    narrations,
    sceneGraph,
    renderContracts,
    compositeNarration,
    validationReport: report,
    intent,
    rhythms: rhythms.length > 0 ? rhythms : undefined,
    motifs:  motifs.length  > 0 ? motifs  : undefined,
    editingPlan,
    continuityScores,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNarrations(beats: CinematicBeat[], _script?: string): NarrationBeat[] {
  // Use per-beat narration generated by the Beat Director.
  // Per-beat narration is punchy (4–12 words) and complements visuals.
  // Estimated speaking rate: ~130 words/min → ~500ms per word → short lines ~1.5–3s.
  return beats.map(b => {
    const text = b.narration.trim();
    const wordCount = text.split(/\s+/).length;
    const durationMs = Math.max(1200, wordCount * 500); // min 1.2s per line
    return {
      beatIndex:  b.index,
      text,
      pauseAfter: 400, // 400ms of silence between narration lines
    } satisfies NarrationBeat;
    void durationMs;
  });
}

function buildCompositeNarration(narrations: NarrationBeat[]): string {
  // Join per-beat narration lines with natural pauses.
  // This replaces the full screenplay text sent to ElevenLabs.
  return narrations
    .filter(n => n.text.trim())
    .map(n => n.text.trim())
    .join('  ');  // two spaces = natural ElevenLabs pause
}

function assembleSceneGraph(
  beats:      CinematicBeat[],
  shots:      ShotPlan[],
  narrations: NarrationBeat[],
): SceneGraphNode[] {
  return beats.map((beat, i) => ({
    index:            i,
    beat,
    shot:             shots[i]!,
    narration:        narrations[i]!,
    previousIndex:    i > 0 ? i - 1 : null,
    nextIndex:        i < beats.length - 1 ? i + 1 : null,
    renderContract:   null,  // populated by prompt compiler
    validationStatus: 'pending',
  }));
}

// ── Bridge to existing StoryBeat type ────────────────────────────────────────
// Lets the cinema pipeline beats slot into the existing Story Memory + Continuity Engine

export function toStoryBeats(beats: CinematicBeat[]): StoryBeat[] {
  return beats.map(b => ({
    beatNumber:       b.index + 1,
    purpose:          b.purpose,
    emotion:          b.emotion,
    bodyLanguage:     b.characterAction,
    composition:      b.visualObjective,
    lighting:         b.lighting,
    keyAction:        b.characterAction,
    environmentFocus: b.environment,
    cameraShot:       b.cameraIntention,
    imperfections:    [],
    camera:           'locked-off shot with natural micro-movement',
  }));
}
