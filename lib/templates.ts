/*  Omnyra template registry
 *  Single source of truth for outcome-driven creation flows.
 *
 *  NOTE: Wording for descriptions, brief_fields, hook_formula, and
 *  script_persona is derived from prior Omnyra product copy (dashboard
 *  outcome cards, landing outcome strip). Replace with authoritative
 *  copy when ready — IDs, default APIs, and structure are locked.
 */

export interface BriefField {
  id: string;
  label: string;
  placeholder: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  default_duration: number;
  default_energy: string;
  default_camera: string;
  default_style: string;
  apis: string[];
  brief_fields: BriefField[];
  hook_formula: string;
  script_persona: string;
}

export const templates: Template[] = [
  {
    id: "ugc-ad",
    name: "Viral UGC Ad",
    description: "Product → hook → motion → download. 60 seconds.",
    emoji: "🎬",
    default_duration: 30,
    default_energy: "High-energy",
    default_camera: "Selfie",
    default_style: "Realistic",
    apis: ["elevenlabs", "kling", "synclabs"],
    brief_fields: [
      {
        id: "product",
        label: "What are you advertising?",
        placeholder: "skincare serum, SaaS tool, fitness app...",
      },
      {
        id: "audience",
        label: "Who's watching?",
        placeholder: "Gen Z women, founders, busy moms...",
      },
      {
        id: "hook_angle",
        label: "What's the hook angle?",
        placeholder: "transformation, controversy, secret method...",
      },
    ],
    hook_formula:
      "Hook in 1 sentence → Pain → Reveal product → Proof → Soft CTA",
    script_persona:
      "Authentic friend recommending a product they actually use, conversational and warm",
  },
  {
    id: "storytime",
    name: "TikTok Storytime",
    description: "Narrative arc. Tension. Payoff. Built to retain.",
    emoji: "📱",
    default_duration: 60,
    default_energy: "Intimate",
    default_camera: "Handheld",
    default_style: "Cinematic",
    apis: ["elevenlabs", "runway", "synclabs"],
    brief_fields: [
      {
        id: "topic",
        label: "What's the story about?",
        placeholder: "the time I quit my job, my worst date...",
      },
      {
        id: "twist",
        label: "What's the twist?",
        placeholder: "what actually happened, the unexpected ending...",
      },
      {
        id: "audience",
        label: "Who's watching?",
        placeholder: "Gen Z, working women, expats...",
      },
    ],
    hook_formula:
      "Inciting line → Build tension → Twist → Cathartic payoff",
    script_persona:
      "First-person storyteller, intimate and confessional, builds with natural pauses",
  },
  {
    id: "influencer",
    name: "AI Influencer Clip",
    description: "Your AI persona. Any scene. Any vibe.",
    emoji: "👤",
    default_duration: 30,
    default_energy: "Confident",
    default_camera: "Studio",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling", "synclabs"],
    brief_fields: [
      {
        id: "persona",
        label: "Who is your AI persona?",
        placeholder: "fashion editor, tech founder, fitness coach...",
      },
      {
        id: "scene",
        label: "What's the scene?",
        placeholder: "Milan rooftop, kitchen, backstage at a runway...",
      },
      {
        id: "message",
        label: "What are they saying?",
        placeholder: "the message, opinion, or moment to capture",
      },
    ],
    hook_formula:
      "Visual hook → Persona POV → Aspirational beat → Signature tagline",
    script_persona:
      "Confident AI persona with a consistent voice and aesthetic, speaks directly to camera",
  },
  {
    id: "product-launch",
    name: "Product Launch Reel",
    description: "Turn product into cinematic social content.",
    emoji: "🛍️",
    default_duration: 30,
    default_energy: "Dramatic",
    default_camera: "Tracking",
    default_style: "Cinematic",
    apis: ["elevenlabs", "runway", "falai"],
    brief_fields: [
      {
        id: "product",
        label: "What are you launching?",
        placeholder: "new collection, hardware drop, app update...",
      },
      {
        id: "value_prop",
        label: "What's the one promise?",
        placeholder: "the single benefit that matters most",
      },
      {
        id: "audience",
        label: "Who is this for?",
        placeholder: "early adopters, designers, gym owners...",
      },
    ],
    hook_formula:
      "Cinematic open → Problem framing → Product reveal → Hero moment → CTA",
    script_persona:
      "Brand-voice narrator with cinematic pacing, restrained and aspirational",
  },
  {
    id: "faceless",
    name: "Faceless Content",
    description: "Voice + visuals. No face required.",
    emoji: "😶",
    default_duration: 45,
    default_energy: "Calm",
    default_camera: "Static",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      {
        id: "topic",
        label: "What's the topic?",
        placeholder: "money, productivity, mindset, history...",
      },
      {
        id: "hook_angle",
        label: "What's the hook?",
        placeholder: "contrarian take, hidden truth, surprising stat...",
      },
      {
        id: "audience",
        label: "Who's watching?",
        placeholder: "indie hackers, students, finance bros...",
      },
    ],
    hook_formula: "Provocative claim → 3 supporting beats → Final reveal",
    script_persona:
      "Authoritative voice-over with visual essay pacing, declarative and confident",
  },
];

export function findTemplate(id: string | null | undefined): Template | null {
  if (!id) return null;
  return templates.find((t) => t.id === id) ?? null;
}
