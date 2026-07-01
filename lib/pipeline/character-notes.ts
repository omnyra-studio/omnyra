import { randomUUID } from "crypto";
import type { CharacterNote, DirectorPlan, SceneSkeleton } from "./types";

// ── Build structured CharacterNotes from Director output ─────────────────────
// One CharacterNote per character in the plan. Each note carries a two-way link:
//   note.linkedSceneIds = scenes where skeleton.characterIndices includes this char's index.
// Replaces the single-character blob approach in lib/visual-continuity.ts.

export function buildCharacterNotes(
  plan:      DirectorPlan,
  skeletons: SceneSkeleton[],
): CharacterNote[] {
  const notes: CharacterNote[] = plan.characters.map((c, charIdx) => {
    const linkedSceneIds = skeletons
      .filter(s => s.characterIndices.includes(charIdx))
      .map(s => s.index);

    const presence = linkedSceneIds.length / (skeletons.length || 1);
    const role: CharacterNote["role"] =
      plan.characters.length === 1 ? "protagonist"
      : charIdx === 0             ? "protagonist"
      : presence >= 0.5           ? "supporting"
      : "background";

    const visualTraits = c.promptFragment?.trim()
      || [c.age, c.sex, c.hair, c.eyes, c.skinTone, c.clothing, c.accessories]
          .filter(Boolean).join(", ");

    return {
      id:             randomUUID().slice(0, 8),
      name:           c.name,
      role,
      visualTraits,
      voiceNotes:     "",
      linkedSceneIds,
    };
  });

  // ── Step 5 logging ───────────────────────────────────────────────────────────
  console.log(`[CHARACTER_NOTES] ${notes.length} character(s) extracted from Director plan:`);
  for (const note of notes) {
    console.log(
      `  [CHARACTER_NOTE] id=${note.id} name="${note.name}" role=${note.role} ` +
      `scenes=[${note.linkedSceneIds.join(",")}] ` +
      `traits="${note.visualTraits.slice(0, 100)}"`
    );
  }

  if (notes.length === 1 && skeletons.length > 1) {
    console.warn(
      "[CHARACTER_NOTES] WARNING: only 1 character detected across " +
      `${skeletons.length} scenes — Director may have missed characters in the script`
    );
  }

  const allUseSameChar = skeletons.every(
    s => s.characterIndices.length === 1 && s.characterIndices[0] === 0
  );
  if (notes.length > 1 && allUseSameChar) {
    console.warn(
      "[CHARACTER_NOTES] WARNING: Director defined " + notes.length + " characters but " +
      "every skeleton uses only index 0 — multi-character assignment was not applied"
    );
  }

  return notes;
}

// ── Supabase persistence — non-fatal ─────────────────────────────────────────
// Saves to character_notes table keyed by user_id + video_url.
// Fails silently if the table doesn't exist — never blocks generation.

export async function saveCharacterNotes(
  notes:    CharacterNote[],
  userId:   string,
  videoUrl: string,
): Promise<void> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error } = await supabase
      .from("character_notes")
      .insert({
        user_id:    userId,
        video_url:  videoUrl,
        characters: notes,
        created_at: new Date().toISOString(),
      });
    if (error) {
      console.warn("[CHARACTER_NOTES] Supabase save failed (non-fatal):", error.message);
    } else {
      console.log(`[CHARACTER_NOTES] Saved ${notes.length} character note(s) for video`);
    }
  } catch (err) {
    console.warn("[CHARACTER_NOTES] Supabase save error (non-fatal):", (err as Error).message);
  }
}
