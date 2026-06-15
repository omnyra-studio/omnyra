import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface UniquenessResult {
  tooSimilar:    boolean;
  maxSimilarity: number;
}

export async function isScriptTooSimilar(
  newScript:  string,
  userId:     string,
  threshold = 0.78,
): Promise<UniquenessResult> {
  try {
    const { data: rows } = await supabaseAdmin
      .from("script_history")
      .select("embedding")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!rows?.length) return { tooSimilar: false, maxSimilarity: 0 };

    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: newScript.slice(0, 8000),
    });
    const newEmb = embedRes.data[0].embedding;

    let maxSim = 0;
    for (const row of rows) {
      if (!row.embedding) continue;
      const sim = cosineSimilarity(newEmb, row.embedding as number[]);
      if (sim > maxSim) maxSim = sim;
    }

    console.info(`[script-uniqueness] maxSimilarity=${maxSim.toFixed(3)} threshold=${threshold} tooSimilar=${maxSim >= threshold}`);
    return { tooSimilar: maxSim >= threshold, maxSimilarity: maxSim };
  } catch (err) {
    console.warn("[script-uniqueness] check failed (non-fatal):", (err as Error).message);
    return { tooSimilar: false, maxSimilarity: 0 };
  }
}

export async function storeScriptHistory(
  script: string,
  userId: string,
  meta:   { goal?: string; niche?: string } = {},
): Promise<void> {
  try {
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: script.slice(0, 8000),
    });
    await supabaseAdmin.from("script_history").insert({
      user_id:     userId,
      script_text: script,
      embedding:   embedRes.data[0].embedding,
      goal:        meta.goal  ?? null,
      niche:       meta.niche ?? null,
    });
  } catch (err) {
    console.warn("[script-uniqueness] store failed (non-fatal):", (err as Error).message);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
