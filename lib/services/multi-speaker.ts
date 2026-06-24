/**
 * Multi-Speaker Audio — parse [Speaker: Name] script labels, generate separate
 * ElevenLabs TTS tracks for each line, concatenate in sequence with ffmpeg.
 *
 * Supports formats:
 *   [Speaker: Grandma] Thank you for helping me.
 *   [Young Man]: Of course. Take my arm.
 *   [Grandma] I was so nervous.
 *
 * Output: single MP3 uploaded to Supabase, returned as { audioUrl, duration }.
 *
 * INTERNAL — voice IDs and processing are server-side only.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { writeFileSync, unlinkSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prepareScriptForTts } from "@/lib/utils/strip-visual-directions";

const BASE_URL        = "https://api.elevenlabs.io/v1";
export const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

// Default voice map — used when the user hasn't specified voices
export const DEFAULT_VOICE_MAP: Record<string, string> = {
  default:       DEFAULT_VOICE_ID,
  male:          "TxGEqnHWrfWFTfGW9XjX",   // Josh
  female:        "EXAVITQu4vr4xnSDxMaL",   // Bella
  elderly_male:  "pNInz6obpgDQGcFmaJgB",   // Adam
  elderly_female:"D38z5RcWu1voky8WS1ja",   // Dorothy
  young_male:    "VR6AewLTigWG4xSOukaG",   // Arnold
  young_female:  "jsCqWAovK2LkecY7zXl4",   // Freya
};

export interface SpeakerSegment {
  speaker: string;
  text:    string;
  lineIndex: number;
}

export interface MultiSpeakerParams {
  script:    string;
  voiceMap?: Record<string, string>;  // speaker name → ElevenLabs voice ID
  userId:    string;
  jobId?:    string;
}

export interface MultiSpeakerResult {
  audioUrl:  string;
  duration:  number;
  speakers:  string[];
  segments:  number;
}

// ── Script parser ──────────────────────────────────────────────────────────────

const SPEAKER_RE = /^\[(?:Speaker:\s*)?([^\]]+?)\]:?\s+(.+)$/;

export function parseSpeakerScript(script: string): SpeakerSegment[] {
  const lines = script.split(/\n/).map(l => l.trim()).filter(Boolean);
  const segments: SpeakerSegment[] = [];
  let fallbackSpeaker = "Narrator";

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const match = SPEAKER_RE.exec(line);
    if (match) {
      const speaker = match[1].trim();
      const text    = match[2].trim();
      if (text) {
        segments.push({ speaker, text, lineIndex: i });
        fallbackSpeaker = speaker; // update for continuation lines
      }
    } else if (line.length > 3) {
      // Continuation line — assign to last speaker
      segments.push({ speaker: fallbackSpeaker, text: line, lineIndex: i });
    }
  }

  return segments;
}

/** Returns true if the script contains multi-speaker markers */
export function isMultiSpeakerScript(script: string): boolean {
  const matches = (script.match(/\[(?:Speaker:\s*)?[^\]]+?\]/g) ?? []);
  const uniqueSpeakers = new Set(matches.map(m => m.replace(/\[(?:Speaker:\s*)?|\]/g, '').trim()));
  return uniqueSpeakers.size >= 2;
}

// ── ElevenLabs single-line TTS (returns raw buffer, no upload) ─────────────────

async function fetchTtsBuffer(
  text:    string,
  voiceId: string,
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const clean = prepareScriptForTts(text.trim());
  if (!clean) throw new Error("Empty TTS text after cleaning");

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key":   apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text:     clean,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability:        0.40,
        similarity_boost: 0.75,
        style:            0.55,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS HTTP ${res.status}: ${errText.substring(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error("ElevenLabs returned empty audio segment");
  return buf;
}

// ── ffmpeg concatenation ───────────────────────────────────────────────────────

function resolveFfmpegBinary(): string {
  const tmp = "/tmp/ffmpeg_multispeak";
  if (ffmpegStatic && process.platform === "linux") {
    try {
      if (!existsSync(tmp)) {
        copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 "${tmp}"`);
      }
      return tmp;
    } catch { /* fall through */ }
  }
  return ffmpegStatic ?? "ffmpeg";
}

async function concatenateAudioBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) return buffers[0];

  const id       = randomUUID().substring(0, 8);
  const tmpDir   = tmpdir();
  const segPaths = buffers.map((buf, i) => {
    const p = join(tmpDir, `omnyra-seg-${id}-${i}.mp3`);
    writeFileSync(p, buf);
    return p;
  });
  const outPath  = join(tmpDir, `omnyra-multi-${id}.mp3`);
  const listPath = join(tmpDir, `omnyra-list-${id}.txt`);

  writeFileSync(listPath, segPaths.map(p => `file '${p}'`).join("\n"));

  const ffmpegBin = resolveFfmpegBinary();
  ffmpeg.setFfmpegPath(ffmpegBin);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c:a", "libmp3lame", "-q:a", "4"])
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });

  const { readFileSync: readFS } = await import("fs");
  const out = readFS(outPath);

  // Clean up temp files
  [...segPaths, outPath, listPath].forEach(p => { try { unlinkSync(p); } catch { /* ignore */ } });

  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateMultiSpeakerVoiceover(
  params: MultiSpeakerParams,
): Promise<MultiSpeakerResult | null> {
  const { script, userId, jobId } = params;
  const voiceMap = { ...DEFAULT_VOICE_MAP, ...(params.voiceMap ?? {}) };

  const segments = parseSpeakerScript(script);
  if (!segments.length) return null;

  const uniqueSpeakers = [...new Set(segments.map(s => s.speaker))];
  console.log(`[MULTI_SPEAK] speakers=${uniqueSpeakers.join(",")} segments=${segments.length} job=${jobId ?? "none"}`);

  // Generate each segment's audio buffer (sequential — ElevenLabs rate limits)
  const audioBuffers: Buffer[] = [];
  for (const seg of segments) {
    const voiceId = voiceMap[seg.speaker]
      ?? voiceMap[seg.speaker.toLowerCase()]
      ?? DEFAULT_VOICE_ID;

    try {
      const buf = await fetchTtsBuffer(seg.text, voiceId);
      audioBuffers.push(buf);
      console.log(`[MULTI_SPEAK] seg=${seg.lineIndex + 1} speaker="${seg.speaker}" voice=${voiceId} ${buf.length}b`);
    } catch (err) {
      console.warn(`[MULTI_SPEAK] seg=${seg.lineIndex + 1} failed (inserting silence):`, (err as Error).message);
      // Insert a short silence buffer so timing remains roughly correct
      audioBuffers.push(Buffer.alloc(8000)); // ~0.5s silence
    }
  }

  // Concatenate all segments
  const finalBuffer = await concatenateAudioBuffers(audioBuffers);
  const duration    = Math.round((finalBuffer.length / 16_000) * 10) / 10;

  // Upload combined audio
  const storagePath = `voice/${userId}/multi-${Date.now()}-${jobId ?? randomUUID().substring(0, 8)}.mp3`;
  const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
    .from("renders")
    .upload(storagePath, finalBuffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadErr || !uploadData) {
    console.error("[MULTI_SPEAK] upload failed:", uploadErr?.message);
    return null;
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(uploadData.path);

  console.log(`[MULTI_SPEAK] done url=${publicUrl.substring(0, 80)} duration=${duration}s`);
  return { audioUrl: publicUrl, duration, speakers: uniqueSpeakers, segments: segments.length };
}
