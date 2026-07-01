import { readFileSync, writeFileSync } from 'fs';

const path = 'app/api/generate-cinematic-sequence/route.ts';
let src = readFileSync(path, 'utf8');

// ── Fix 1: Remove !mainImage condition — Flux should ALWAYS generate per-scene images ──
// When user provides image, it becomes scene 0. Scenes 1..N still need unique Flux images.
const OLD_FLUX_CONDITION = "        if (!mainImage && !_isAnimated && cinemaPipeline) {";
const NEW_FLUX_CONDITION = "        if (!_isAnimated && cinemaPipeline) {";

if (src.includes(OLD_FLUX_CONDITION)) {
  src = src.replace(OLD_FLUX_CONDITION, NEW_FLUX_CONDITION);
  console.log('OK Fix 1: removed !mainImage gate from Flux generation');
} else {
  console.log('WARN Fix 1: flux condition not found');
}

// ── Fix 2: Preserve user-provided image for scene 0 when Flux runs ──
// Current code unconditionally overwrites mainImage with Flux result for idx===0.
// Must check if user already provided an image and skip overwrite for slot 0.
const OLD_SCENE0_ASSIGN = "              if (r.status === 'fulfilled') {\r\n                sceneImageUrls[idx] = r.value;\r\n                lastGoodUrl = r.value;\r\n                if (idx === 0) mainImage = r.value;";

const NEW_SCENE0_ASSIGN = "              if (r.status === 'fulfilled') {\r\n                // For scene 0: keep user-provided image if they supplied one.\r\n                // For scenes 1..N: always use unique Flux image so each clip matches its script.\r\n                const keepUserImage = idx === 0 && sceneImageUrls[0] && !sceneImageUrls[0].includes('fal.');\r\n                if (!keepUserImage) {\r\n                  sceneImageUrls[idx] = r.value;\r\n                  if (idx === 0) mainImage = r.value;\r\n                }\r\n                lastGoodUrl = r.value;";

if (src.includes(OLD_SCENE0_ASSIGN)) {
  src = src.replace(OLD_SCENE0_ASSIGN, NEW_SCENE0_ASSIGN);
  console.log('OK Fix 2: scene 0 user-image preservation');
} else {
  // Try to find the actual bytes
  const idx = src.indexOf("if (idx === 0) mainImage = r.value;");
  console.log('WARN Fix 2: not found, searching...', idx);
  if (idx > -1) {
    console.log('Context:', JSON.stringify(src.slice(idx - 150, idx + 80)));
  }
}

// ── Fix 3: Prefer per-scene images over chainFrame for scenes 1..N ──
// OLD: chainFrame ?? sceneImageUrls[i]  → chainFrame always wins (same anchor for all)
// NEW: sceneImageUrls[i] ?? chainFrame  → unique per-scene image used, chainFrame as fallback
const OLD_SCENE_IMG = "              const sceneImg = chainFrame ?? sceneImageUrls[i] ?? sceneImageUrls[0];";
const NEW_SCENE_IMG  = "              // Prefer per-scene Flux image (unique env/lighting per script beat);\r\n              // fall back to chainFrame (anchor continuity) only when no per-scene image.\r\n              const sceneImg = sceneImageUrls[i] ?? chainFrame ?? sceneImageUrls[0];";

if (src.includes(OLD_SCENE_IMG)) {
  src = src.replace(OLD_SCENE_IMG, NEW_SCENE_IMG);
  console.log('OK Fix 3: per-scene image priority over chainFrame');
} else {
  console.log('WARN Fix 3: scene img line not found');
  const idx2 = src.indexOf('chainFrame ?? sceneImageUrls[i]');
  console.log('Searching...', idx2);
  if (idx2 > -1) console.log('Context:', JSON.stringify(src.slice(idx2 - 20, idx2 + 80)));
}

writeFileSync(path, src, 'utf8');
console.log('Done.');
