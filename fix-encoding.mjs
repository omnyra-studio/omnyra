import { readFileSync, writeFileSync } from 'fs';

const path = 'app/api/generate-cinematic-sequence/route.ts';
let src = readFileSync(path, 'utf8');

// After previous curly-quote fix, U+201D was replaced with ASCII ".
// This created broken sequences like: â€" (where " is now ASCII 0x22)
// These are all garbled Windows-1252 renderings of UTF-8 special chars.
// Fix: replace with the correct Unicode characters.

const before = src.length;

// Garbled em-dash: U+00E2 U+20AC followed by ASCII double-quote (0x22)
src = src.replace(/â€"/g, '—');  // — em-dash

// Garbled en-dash: U+00E2 U+20AC followed by specific chars
src = src.replace(/â€/g, '–');  // – en-dash

// Any remaining â€ sequences (with remaining special chars)
src = src.replace(/â€/g, '“');  // " left double quote
src = src.replace(/â€/g, '”');  // " right double quote
src = src.replace(/â€/g, '‘');  // ' left single quote
src = src.replace(/â€/g, '’');  // ' right single quote
src = src.replace(/â€¦/g, '…');  // … ellipsis

// Any remaining lone â followed by euro sign followed by anything
// Replace entire â€X sequences with a simple dash for safety
src = src.replace(/â€./g, '-');

const after = src.length;
const changes = before - after;
console.log(`Fixed encoding. Length change: ${changes} chars`);

// Verify no more broken sequences
const remaining = (src.match(/â€/g) || []).length;
console.log(`Remaining broken sequences: ${remaining}`);

writeFileSync(path, src, 'utf8');
console.log('Done.');
