/**
 * Director Intent Engine — highest priority layer.
 *
 * Runs before Beat Director. Decides the film's core identity:
 * theme, genre, pace, emotional curve, visual language, camera philosophy.
 *
 * Every downstream stage inherits from this intent.
 * Uses Claude Haiku for speed (~0.8s), 350 tokens max.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DirectorIntent, FilmPace, FilmEnding } from "./types";
import type { NicheSettings } from "@/lib/config/nicheSettings";

const anthropic = new Anthropic();

const SYSTEM = `You are a Film Director for Omnyra. Given a story idea and niche, decide the directorial intent for a short cinematic video.

Output ONLY valid JSON. No markdown. No explanation.

Schema:
{
  "theme": "string — the core human theme (2–5 words)",
  "genre": "string — e.g. cinematic realism, documentary, intimate drama",
  "pace": "slow|medium|fast|slow-then-fast|fast-then-slow",
  "audience": "string — target audience description",
  "emotionalCurve": "string — emotional journey arc, e.g. 'isolation → decision → quiet hope'",
  "visualLanguage": "string — visual style in 8–15 words",
  "editingRhythm": "string — editing approach in 8–15 words",
  "colourLanguage": "string — colour palette and arc in 8–15 words",
  "cameraPhilosophy": "string — how camera relates to subject in 8–15 words",
  "ending": "hopeful|bittersweet|triumphant|open|resolved|ambiguous",
  "dominantTexture": "string — grain, softness, contrast description"
}`;

// Niche-informed baseline intent (fast local fallback, no API needed)
const NICHE_BASELINE: Record<string, Partial<DirectorIntent>> = {
  motivation_success: {
    genre: "cinematic realism", pace: "slow-then-fast",
    cameraPhilosophy: "camera closes in as internal resistance transforms",
    colourLanguage: "desaturated opening, warming to golden as conviction builds",
    ending: "triumphant",
  },
  health_fitness: {
    genre: "sports documentary", pace: "fast",
    cameraPhilosophy: "camera moves with the body — tracking, push-in, low angle",
    ending: "triumphant",
  },
  mental_health: {
    genre: "intimate drama", pace: "slow",
    cameraPhilosophy: "observational — never intrusive, always respectful distance",
    colourLanguage: "cool blues shifting to warmer tones as understanding grows",
    ending: "hopeful",
  },
  relationships_dating: {
    genre: "intimate drama", pace: "slow-then-fast",
    cameraPhilosophy: "close observation of micro-expressions, holds on silence",
    ending: "bittersweet",
  },
  food_recipes: {
    genre: "sensory documentary", pace: "medium",
    cameraPhilosophy: "insert shots celebrate texture and detail",
    colourLanguage: "warm, rich, appetising — golden hour or warm practical light",
    ending: "resolved",
  },
  faceless_stoic: {
    genre: "meditative realism", pace: "slow",
    cameraPhilosophy: "never shows face — environment becomes the character",
    ending: "open",
  },
  finance_investing: {
    genre: "cinematic realism", pace: "medium",
    cameraPhilosophy: "clean observational — follows the work, not the result",
    colourLanguage: "warm indoor practical light, trustworthy neutral palette",
    ending: "hopeful",
  },
  tech_ai: {
    genre: "futuristic documentary", pace: "fast",
    cameraPhilosophy: "controlled orbit around discovery moments, push-in on reveals",
    colourLanguage: "clean neon-accented cool blues with sharp contrast",
    ending: "open",
  },
  animation_3d: {
    genre: "animated cinema", pace: "medium",
    cameraPhilosophy: "smooth tracking follows character emotional arc",
    colourLanguage: "rich saturated palette, physically accurate lighting rigs",
    ending: "resolved",
  },
};

export async function deriveDirectorIntent(params: {
  idea:          string;
  niche:         string;
  nicheSettings: NicheSettings;
}): Promise<DirectorIntent> {
  const { idea, niche, nicheSettings } = params;
  const baseline = NICHE_BASELINE[niche] ?? {};

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     SYSTEM,
      messages: [{
        role:    'user',
        content: `Niche: ${niche}\nEmotional Arc: ${nicheSettings.emotionalArc ?? 'challenge → effort → resolution'}\nStory Idea: ${idea.slice(0, 500)}`,
      }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);

    return mergeWithBaseline(parsed, baseline);
  } catch (err) {
    console.warn('[DirectorIntent] API failed, using niche baseline:', err instanceof Error ? err.message : err);
    return buildFallback(idea, niche, baseline, nicheSettings);
  }
}

function mergeWithBaseline(parsed: Record<string, unknown>, baseline: Partial<DirectorIntent>): DirectorIntent {
  return {
    theme:            String(parsed.theme            ?? 'human connection'),
    genre:            String(parsed.genre            ?? baseline.genre             ?? 'cinematic realism'),
    pace:             (parsed.pace as FilmPace)      ?? baseline.pace              ?? 'slow-then-fast',
    audience:         String(parsed.audience         ?? 'adults 18–45'),
    emotionalCurve:   String(parsed.emotionalCurve   ?? 'conflict → effort → resolution'),
    visualLanguage:   String(parsed.visualLanguage   ?? baseline.visualLanguage   ?? 'naturalistic, close observation'),
    editingRhythm:    String(parsed.editingRhythm    ?? baseline.editingRhythm    ?? 'long takes opening, measured pace throughout'),
    colourLanguage:   String(parsed.colourLanguage   ?? baseline.colourLanguage   ?? 'natural, warm practical light'),
    cameraPhilosophy: String(parsed.cameraPhilosophy ?? baseline.cameraPhilosophy ?? 'observational — camera discovers'),
    ending:           (parsed.ending as FilmEnding)  ?? baseline.ending           ?? 'hopeful',
    dominantTexture:  String(parsed.dominantTexture  ?? 'cinematic grain, shallow depth'),
  };
}

function buildFallback(idea: string, niche: string, baseline: Partial<DirectorIntent>, settings: NicheSettings): DirectorIntent {
  return {
    theme:            deriveTheme(idea),
    genre:            baseline.genre            ?? 'cinematic realism',
    pace:             baseline.pace             ?? 'slow-then-fast',
    audience:         deriveAudience(niche),
    emotionalCurve:   settings.emotionalArc     ?? 'challenge → effort → resolution',
    visualLanguage:   baseline.visualLanguage   ?? 'naturalistic, handheld intimacy, Roger Deakins lighting',
    editingRhythm:    baseline.editingRhythm    ?? 'long takes building to faster payoff',
    colourLanguage:   baseline.colourLanguage   ?? 'warm golden practical light, teal-orange grade',
    cameraPhilosophy: baseline.cameraPhilosophy ?? 'observational — camera discovers, never leads',
    ending:           baseline.ending           ?? 'hopeful',
    dominantTexture:  'cinematic grain, shallow depth of field',
  };
}

function deriveTheme(idea: string): string {
  const low = idea.toLowerCase();
  if (/(kind|help|strangers?|unexpected)/i.test(low)) return 'unexpected kindness';
  if (/(loss|grief|mourn|miss)/i.test(low))          return 'navigating loss';
  if (/(triumph|success|over|persever)/i.test(low))  return 'earned triumph';
  if (/(love|connect|togeth|relationship)/i.test(low)) return 'human connection';
  if (/(lonely|alone|isolat)/i.test(low))            return 'finding belonging';
  return 'quiet human truth';
}

function deriveAudience(niche: string): string {
  const map: Record<string, string> = {
    health_fitness:       'health-conscious adults 18–35',
    motivation_success:   'ambitious adults 20–40',
    mental_health:        'adults 20–40 seeking understanding',
    luxury_lifestyle:     'aspirational adults 28–50',
    gaming:               'gamers 16–30',
    pets:                 'pet owners 25–45',
    finance_investing:    'financially curious adults 25–45',
    side_hustles:         'entrepreneurial adults 20–40',
    tech_ai:              'tech-forward adults 20–40',
    relationships_dating: 'adults 22–40 navigating relationships',
    faceless_stoic:       'self-disciplined men 18–35',
    beauty_skincare:      'beauty-conscious adults 18–40',
    food_recipes:         'home cooks and food lovers 20–45',
    product_reviews:      'value-conscious shoppers 22–40',
    animation_3d:         'creatives and dreamers 16–35',
  };
  return map[niche] ?? 'adults 20–45 on social media';
}
