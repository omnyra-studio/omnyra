/**
 * Strip camera directions and stage directions from a script before TTS.
 * The ORIGINAL script (with directions) must still go to video prompts.
 * This function only touches what goes to ElevenLabs.
 */
export function stripVisualDirections(script: string): string {
  // Step 1: Strip [bracket] directives entirely (scene headers, cut notes, etc.)
  let cleaned = script.replace(/\[.*?\]/gi, "");

  // Step 2: Remove V.O. / voiceover line labels
  cleaned = cleaned.replace(/^\s*(?:voiceover:|v\.o\.|v\/o)\s*/gim, "");

  // Step 3: Strip inline camera direction phrases embedded mid-sentence only.
  // Removes the camera phrase itself — leaves surrounding narration intact.
  cleaned = cleaned.replace(
    /,?\s*(?:zoom(?:s)? in|zoom(?:s)? out|camera (?:pulls? back|pushes? in|holds?|follows?|tracks?|pans?(?: left| right)?|tilts?(?: up| down)?)|slowly zooms?|cut(?:s)? to|smash cut|rack focus|pull(?:s)? back|push(?:es)? in|pan(?:s)? (?:left|right)|tilt(?:s)? (?:up|down)|tracking shot|dolly (?:in|out)|aerial shot|overhead shot|pov shot)[^,.!?]*/gi,
    ""
  );

  // Step 4: Cleanup punctuation artifacts from inline stripping
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[,.]\s*/gm, "");

  // Step 5: Line-by-line pass — handle lines that START with camera direction keywords.
  // IMPORTANT: do NOT drop the whole line — try to extract the narration that follows.
  // e.g. "Wide shot." → pure direction → drop
  // e.g. "Close-up on soldier's trembling hand." → extract "soldier's trembling hand." → keep
  const DIR_START_RE = /^(?:camera\b|cut to\b|zoom\b|pan\b|tilt\b|dolly\b|tracking shot\b|wide shot\b|close.?up\b|over.?shoulder\b|overhead\b|aerial\b|pov\b)/i;

  const processed = cleaned
    .split("\n")
    .map(line => {
      const t = line.trim();
      if (!t) return "";
      if (!DIR_START_RE.test(t)) return t; // Normal narration — keep as-is

      // Strip the direction keyword + any colon/dash/period separator and leading prepositions
      const afterDir = t
        .replace(/^(?:camera|cut to|zoom|pan|tilt|dolly|tracking shot|wide shot|close.?up|over.?shoulder|overhead|aerial|pov)\s*[:\-–—.]?\s*/i, "")
        .replace(/^(?:on|of|to|in|at|from|through|toward)\s+/i, "")
        .trim();

      // Keep if there's 3+ words of meaningful content (genuine narration fragment)
      const wordCount = afterDir.split(/\s+/).filter(Boolean).length;
      return wordCount >= 3 ? afterDir : "";
    })
    .filter(line => line.trim().length > 0);

  return processed
    .join("\n")
    .replace(/\s{2,}/g, " ")
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
