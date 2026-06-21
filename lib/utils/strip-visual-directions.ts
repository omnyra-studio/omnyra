/**
 * Strip camera directions and stage directions from a script before TTS.
 * The ORIGINAL script (with directions) must still go to video prompts.
 * This function only touches what goes to ElevenLabs.
 */
export function stripVisualDirections(script: string): string {
  return script
    .replace(/\[.*?\]/gi, "")
    .replace(/^(camera\s|zoom\s|cut\s|close.up|wide\s|pan\s|tilt\s|dolly|tracking|shot\s|scene\s|angle|fade|smash\s|rack\s|handheld|steady|focus|lens|bokeh|b-roll|voiceover:|v\.o\.|v\/o)/gim, "")
    .replace(/,?\s*(zoom in|zoom out|camera pulls|camera pushes|camera steady|camera follows|slowly zooms|cuts to|smash cut|rack focus|wide shot|close up|closeup|tight on|pull back|push in|pan (left|right)|tilt (up|down)|tracking shot|handheld|dolly (in|out)|aerial|overhead|POV shot|establishing shot)[^,.]*/gi, "")
    .replace(/,?\s*(she|he|they|girl|woman|man|soldier|the character)\s+(looks? (up|down|away|at camera)|turns?|glances?|walks?|stands?|sits?|reaches?|holds?|pauses?|nods?|sighs?)[^,.]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[,.]\s*/gm, "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

/**
 * Strip visual directions with logging and safety fallback.
 * Use this at TTS call sites.
 *
 * @param script - original script (may contain [SCENE], camera directions, etc.)
 * @returns      - cleaned script safe for text-to-speech
 */
export function prepareScriptForTts(script: string): string {
  const before = script.trim();
  console.log(`[TTS_SCRIPT_BEFORE] length=${before.length} preview="${before.substring(0, 120).replace(/\n/g, "↵")}"`);

  let after = stripVisualDirections(before);

  if (after.length < 50) {
    console.warn(`[TTS_STRIP_WARNING] stripped result too short (${after.length} chars) — falling back to bracket-only strip`);
    after = before
      .replace(/\[.*?\]/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  console.log(`[TTS_SCRIPT_AFTER] length=${after.length} preview="${after.substring(0, 120).replace(/\n/g, "↵")}"`);
  return after;
}
