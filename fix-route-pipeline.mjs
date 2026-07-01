import { readFileSync, writeFileSync } from 'fs';

const path = 'app/api/generate-cinematic-sequence/route.ts';
let src = readFileSync(path, 'utf8');

// Update route version
src = src.replace(
  '"2026-06-27-v45-per-scene-images-fix"',
  '"2026-06-28-v46-director-pipeline"'
);

// Add pipeline import after existing imports (find last import line)
const PIPELINE_IMPORT = `import { runPipeline } from "@/lib/pipeline/engine";\r\nimport type { PipelineInput } from "@/lib/pipeline/types";`;

// Insert after the last import line (find "import type { CinemaPipelineResult }")
const ANCHOR_IMPORT = 'import type { CinemaPipelineResult } from "@/lib/cinema/types";';
if (src.includes(ANCHOR_IMPORT)) {
  src = src.replace(ANCHOR_IMPORT, ANCHOR_IMPORT + '\r\n' + PIPELINE_IMPORT);
  console.log('OK: added pipeline import');
} else {
  console.log('WARN: anchor import not found');
}

// After the guardrail check, inject the new pipeline routing.
// When script + voiceId are present -> Director AI pipeline (new path).
// Otherwise fall through to existing logic.
const GUARDRAIL_DONE = `        lastStageLogged = 'GUARDRAIL_done';\r\n        console.log(\`[STAGE_3_GUARDRAIL] done\`);`;

const PIPELINE_INJECTION = `        lastStageLogged = 'GUARDRAIL_done';\r\n        console.log(\`[STAGE_3_GUARDRAIL] done\`);\r\n\r\n        // ── NEW PIPELINE: Director AI + Voice-first + SceneContracts ──────────────\r\n        // Activates when script text is present (new production flow).\r\n        // Falls through to legacy path when only prompts[] are provided.\r\n        if (script && script.trim().length > 20 && process.env.RUNWAYML_API_SECRET) {\r\n          lastStageLogged = 'DIRECTOR_PIPELINE_start';\r\n          console.log('[PIPELINE_V2] Director pipeline activated');\r\n          const pipelineInput: PipelineInput = {\r\n            script:             script.trim(),\r\n            voiceId:            voiceId ?? 'EXAVITQu4vr4xnSDxMaL',\r\n            niche:              niche ?? 'lifestyle',\r\n            referenceImageUrl:  (imageUrl ?? bodySceneImages[0]) || undefined,\r\n            userId:             user.id,\r\n            targetDuration:     (targetDuration as 30 | 60 | 90),\r\n            speedMode,\r\n            aspectRatio:        '9:16',\r\n          };\r\n          const pipelineResult = await runPipeline(pipelineInput);\r\n          const pipelineCost   = CREDIT_COSTS.video_cinematic;\r\n          await saveRenderToLibrary({\r\n            userId:          user.id,\r\n            videoUrl:        pipelineResult.videoUrl,\r\n            durationSeconds: pipelineResult.durationSeconds,\r\n            niche:           niche,\r\n          }).catch(e => console.warn('[SAVE_RENDER] non-fatal:', e));\r\n          return {\r\n            data: {\r\n              success:         true,\r\n              partial:         pipelineResult.qualityScore < 1,\r\n              videoUrl:        pipelineResult.videoUrl,\r\n              stitched_url:    pipelineResult.videoUrl,\r\n              audio_url:       pipelineResult.audioUrl,\r\n              hasAudio:        true,\r\n              hasMotion:       true,\r\n              duration:        pipelineResult.durationSeconds,\r\n              total_duration:  pipelineResult.durationSeconds,\r\n              clips_succeeded: pipelineResult.scenes.filter(s => s.passed).length,\r\n              clips_failed:    pipelineResult.scenes.filter(s => !s.passed).length,\r\n              clip_urls:       pipelineResult.scenes.map(s => s.clipUrl).filter(Boolean),\r\n              source_images:   pipelineResult.scenes.map(s => s.imageUrl),\r\n              quality_score:   pipelineResult.qualityScore,\r\n              pipeline_version: 'director-v1',\r\n              SEQUENCE_ROUTE_VERSION: '2026-06-28-v46-director-pipeline',\r\n            },\r\n            actualCost: pipelineCost,\r\n          };\r\n        }\r\n        // ── END NEW PIPELINE ────────────────────────────────────────────────────`;

if (src.includes(GUARDRAIL_DONE)) {
  src = src.replace(GUARDRAIL_DONE, PIPELINE_INJECTION);
  console.log('OK: injected Director pipeline routing');
} else {
  console.log('WARN: guardrail done anchor not found');
  // try to find context
  const idx = src.indexOf("GUARDRAIL_done");
  console.log('Searching for GUARDRAIL_done at:', idx);
}

writeFileSync(path, src, 'utf8');
console.log('Done.');
