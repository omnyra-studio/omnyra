// One-shot engine test — inserts real test data then calls /api/parallel-render on Vercel.
// Run: node scripts/test-engine.mjs
//
// Reads DIRECT_URL + all AI keys from .env.local automatically.

import { readFileSync } from "node:fs";
import { createConnection } from "node:net";

// ── Load .env.local ───────────────────────────────────────────────────────────
const envLines = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?(.+?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const PG_URL   = env["DIRECT_URL"]?.replace(/^"/, "").replace(/"$/, "");
const VERCEL   = env["NEXT_PUBLIC_APP_URL"] || "https://omnyra.studio";

console.log("Postgres:", PG_URL?.slice(0, 40) + "...");
console.log("Vercel:  ", VERCEL);

// ── Postgres client (using pg via dynamic import) ─────────────────────────────
const { default: pg } = await import("pg");
const { Client } = pg;

const client = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("[DB] connected");

// ── Constants ─────────────────────────────────────────────────────────────────
const USER_ID      = "538472e6-c8f5-47ff-aab7-b9ab28a4f0c4"; // bellac686@gmail.com
const CHAR_ID      = "7aafd1f2-9875-4e8f-a20c-b538119aba46"; // bella character
const PROJECT_ID   = "eb3d09de-6d65-4c0c-a187-07d479718871"; // first project
const VOICE_ID     = "EXAVITQu4vr4xnSDxMaO"; // Bella voice
const FULL_SCRIPT  = "He had no idea anyone was filming. What he did next says everything about who he really is. He took her hand at sunset and they danced.";

// ── Insert test data ──────────────────────────────────────────────────────────

// 1. Script (no user_id column — ownership via projects.user_id)
const scriptRes = await client.query(`
  INSERT INTO scripts (project_id, version, script_text, status)
  VALUES ($1, 1, $2, 'draft')
  RETURNING id
`, [PROJECT_ID, FULL_SCRIPT]);
const scriptId = scriptRes.rows[0].id;
console.log("[DB] script created:", scriptId);

// 2. Shot plan
const planRes = await client.query(`
  INSERT INTO shot_plans (script_id, project_id, motion_map, status)
  VALUES ($1, $2, '{}', 'ready')
  RETURNING id
`, [scriptId, PROJECT_ID]);
const planId = planRes.rows[0].id;
console.log("[DB] shot_plan created:", planId);

// 3. Two Kling shots (render_assignment=fal; shots has no narration_text — engine uses audio_intent)
await client.query(`
  INSERT INTO shots (shot_plan_id, script_id, project_id, shot_id, shot_number,
    attention_function, purpose_rationale, duration_seconds, energy_curve,
    camera_behavior, motion_intensity, framing, content_type, visual_prompt,
    render_assignment, audio_intent, fatigue_risk, transition_in, transition_duration) VALUES
  ($1,$2,$3,'shot-001',1,'curiosity_spike','Open hook',5,'spike',
   'static',0.6,'medium','broll','A man walking alone at sunset, golden hour light, unaware he is being filmed, cinematic wide shot',
   'fal','He had no idea anyone was filming.',0.2,'hard_cut',0.0),
  ($1,$2,$3,'shot-002',2,'emotional_release','Tender moment',5,'ramp_up',
   'slow_push_in',0.5,'medium_closeup','broll','A man gently taking a woman''s hand at sunset, their silhouettes against golden sky, romantic slow motion',
   'fal','He took her hand and they danced.',0.15,'soft_dissolve',0.3)
`, [planId, scriptId, PROJECT_ID]);

console.log("[DB] 2 shots created");

// ── Call Vercel API ───────────────────────────────────────────────────────────
console.log("\n[API] Calling POST /api/parallel-render ...");
console.log("[API] planId:", planId);
console.log("[API] characterId:", CHAR_ID);

const CRON_SECRET = env["CRON_SECRET"];
const payload = {
  planId,
  userId:       USER_ID,
  fullScript:   FULL_SCRIPT,
  characterIds: [CHAR_ID],
  voiceId:      VOICE_ID,
  speedMode:    "draft",
  maxClips:     2,
  skipStitch:   false,
};

console.log("[API] hitting /api/test-run with CRON_SECRET gate ...");
const apiRes = await fetch(`${VERCEL}/api/test-run`, {
  method:  "POST",
  headers: { "Content-Type": "application/json", "x-test-secret": CRON_SECRET },
  body:    JSON.stringify(payload),
});

const apiText = await apiRes.text();
console.log("[API] status:", apiRes.status);
try {
  const parsed = JSON.parse(apiText);
  console.log("[API] result:", JSON.stringify(parsed, null, 2));
} catch {
  console.log("[API] raw:", apiText.slice(0, 1000));
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
await client.query("DELETE FROM shot_plans WHERE id=$1", [planId]);
await client.query("DELETE FROM scripts WHERE id=$1", [scriptId]);
console.log("[DB] test data cleaned up");
await client.end();
