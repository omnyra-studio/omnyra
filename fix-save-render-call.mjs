import { readFileSync, writeFileSync } from 'fs';

const path = 'app/api/generate-cinematic-sequence/route.ts';
let src = readFileSync(path, 'utf8');

const OLD = `          await saveRenderToLibrary({\r\n            userId:          user.id,\r\n            videoUrl:        pipelineResult.videoUrl,\r\n            durationSeconds: pipelineResult.durationSeconds,\r\n            niche:           niche,\r\n          }).catch(e => console.warn('[SAVE_RENDER] non-fatal:', e));`;

const NEW = `          await saveRenderToLibrary({\r\n            userId:   user.id,\r\n            videoUrl: pipelineResult.videoUrl,\r\n            script:   script ?? null,\r\n          }).catch(e => console.warn('[SAVE_RENDER] non-fatal:', e));`;

if (src.includes(OLD)) {
  src = src.replace(OLD, NEW);
  console.log('OK: fixed saveRenderToLibrary call');
} else {
  console.log('WARN: pattern not found');
  const idx = src.indexOf('saveRenderToLibrary');
  if (idx > -1) console.log('Context:', JSON.stringify(src.slice(idx - 10, idx + 200)));
}

writeFileSync(path, src, 'utf8');
