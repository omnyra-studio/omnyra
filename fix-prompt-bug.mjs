import { readFileSync, writeFileSync } from 'fs';

const path = 'app/api/generate-cinematic-sequence/route.ts';
let src = readFileSync(path, 'utf8');

// Fix 1: Remove duplicate driftMotionStrength/driftPromptPrefix declarations (CRLF line endings)
const dupBlock = "        let driftMotionStrength = 0.80;\r\n        let driftPromptPrefix   = '';\r\n\r\n        // Await upscaled image (parallel with voiceover/ambient).";
const dedupBlock = "        // Await upscaled image (parallel with voiceover/ambient).";

if (src.includes(dupBlock)) {
  src = src.replace(dupBlock, dedupBlock);
  console.log('OK: removed duplicate driftMotionStrength/driftPromptPrefix');
} else {
  console.log('WARN: dup block not found');
}

// Fix 2: For scenes 1..N, use klingScenePrompts[i] directly (no story context prefix, no CONTINUITY_PREFIX)
const OLD_PROMPT = "       const klingPrompt = i === 0\r\n            ? klingScenePrompts[i]\r\n            : (driftPromptPrefix + buildStoryContextPrefix(storyMem) + CONTINUITY_PREFIX + klingScenePrompts[i]).slice(0, 500);";

const NEW_PROMPT = "       // All scenes use their dedicated klingScenePrompts directly.\r\n          // For parallel Runway generation, continuity is handled by chainFrame (anchor last-frame),\r\n          // not by story-context/continuity-lock text (which was eating the 512-char prompt budget).\r\n          const klingPrompt = klingScenePrompts[i];";

if (src.includes(OLD_PROMPT)) {
  src = src.replace(OLD_PROMPT, NEW_PROMPT);
  console.log('OK: fixed parallel scene prompt');
} else {
  console.log('WARN: old prompt pattern not found');
  // Try to find it
  const idx = src.indexOf('klingScenePrompts[i]');
  console.log('Found klingScenePrompts at:', idx);
  console.log('Context:', JSON.stringify(src.slice(idx - 60, idx + 200)));
}

writeFileSync(path, src, 'utf8');
console.log('Done.');
