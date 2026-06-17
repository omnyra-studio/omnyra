export interface NicheTool {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
}

export const NICHE_TOOLS: NicheTool[] = [
  { id: 'psychology',      title: 'Psychology · Kindness · Honesty',          desc: 'Emotional depth, human behaviour',         icon: '🧠', color: 'from-purple-500 to-violet-500' },
  { id: 'history',         title: 'History · True Stories · Documentary',     desc: 'Historical events, real stories',          icon: '🏛️', color: 'from-amber-500 to-orange-600' },
  { id: 'gaming',          title: 'Gaming',                                   desc: 'Gameplay, esports, gaming culture',        icon: '🎮', color: 'from-emerald-500 to-teal-500' },
  { id: 'self-improvement',title: 'Self Improvement · Mindset',               desc: 'Growth, motivation, habits',              icon: '🌱', color: 'from-blue-500 to-cyan-500' },
  { id: 'relationships',   title: 'Relationships · Dating · Love',            desc: 'Love, connection, heartbreak',            icon: '❤️', color: 'from-red-500 to-pink-500' },
  { id: 'friendships',     title: 'Friendships · Social Life',                desc: 'Bonds, loyalty, social moments',          icon: '👥', color: 'from-indigo-500 to-blue-500' },
  { id: 'spirituality',    title: 'Spirituality · Faith · Wellness',          desc: 'Inner peace, faith, mindfulness',         icon: '🙏', color: 'from-violet-500 to-purple-500' },
  { id: 'lifestyle',       title: 'Lifestyle · Daily Life · Vlog',            desc: 'Everyday moments, aesthetic life',        icon: '🌅', color: 'from-amber-500 to-yellow-500' },
  { id: 'beauty-skincare', title: 'Beauty · Skincare · Makeup',               desc: 'Glow-ups, routines, transformations',     icon: '💄', color: 'from-pink-500 to-rose-500' },
  { id: 'fitness',         title: 'Fitness · Health · Body',                  desc: 'Workouts, wellness, transformation',      icon: '🏋️', color: 'from-emerald-500 to-teal-500' },
  { id: 'cooking',         title: 'Food · Recipes · Cooking',                 desc: 'Recipes, kitchen, food content',          icon: '🍳', color: 'from-orange-500 to-amber-500' },
  { id: 'fashion',         title: 'Fashion · Style · Trends',                 desc: 'Outfits, trends, styling',               icon: '👗', color: 'from-fuchsia-500 to-pink-500' },
  { id: 'business',        title: 'Business · Finance · Entrepreneurship',    desc: 'Money, startups, success',               icon: '💼', color: 'from-cyan-500 to-blue-500' },
  { id: 'travel',          title: 'Travel · Adventure · Culture',             desc: 'Exploration, destinations',               icon: '✈️', color: 'from-teal-500 to-cyan-500' },
  { id: 'parenting',       title: 'Parenting · Family · Mom Life',            desc: 'Family, kids, parenting',                icon: '👨‍👩‍👧', color: 'from-purple-500 to-violet-500' },
  { id: 'animation',       title: 'Animation',                                desc: 'Animated stories, characters, motion',   icon: '🎞️', color: 'from-fuchsia-600 to-pink-600' },
  { id: 'motivation',      title: 'Motivation · Hustle · Success',            desc: 'Inspiration, mindset',                   icon: '🔥', color: 'from-orange-500 to-red-500' },
  { id: 'comedy',          title: 'Comedy · Entertainment · Pop Culture',     desc: 'Funny, viral, entertainment',            icon: '😂', color: 'from-yellow-500 to-amber-500' },
];

/**
 * Niche prefills — injected into the AI system prompt as a hidden mode trigger.
 * These condition the script writer, scene generator and video AI toward
 * the correct visual language for each niche.
 */
export const NICHE_PREFILLS: Record<string, string> = {
  'psychology':       'PSYCHOLOGY · KINDNESS · HONESTY MODE — Deep emotional insight through observable human actions and micro-expressions. Avoid on-screen text. Ghost Test enforced. Show, never tell.',
  'history':          'HISTORY · TRUE STORIES MODE — Period-accurate uniforms, props, environments and lighting. No modern elements. Cinematic documentary grade. Ghost Test enforced.',
  'gaming':           'GAMING MODE — Dynamic gameplay energy, screen reactions, neon lighting, competitive intensity. Fast cuts, immersive POV moments. Ghost Test enforced.',
  'self-improvement': 'SELF IMPROVEMENT MODE — Visible transformation, determination and mindset shifts shown through body language, posture and focused action. Ghost Test enforced.',
  'relationships':    'RELATIONSHIPS · DATING MODE — Emotional connection shown through touch, glances, body language and quiet shared moments. Warm cinematic colour. Ghost Test enforced.',
  'friendships':      'FRIENDSHIPS MODE — Warm bonds shown through laughter, physical closeness, shared effort and loyalty under pressure. Ghost Test enforced.',
  'spirituality':     'SPIRITUALITY · WELLNESS MODE — Calm, sacred and mindful moments. Soft golden light, stillness, inner peace conveyed through breath and posture. Ghost Test enforced.',
  'lifestyle':        'LIFESTYLE · DAILY LIFE MODE — Aesthetic, relatable everyday moments. Natural light, real settings, candid authentic energy. Ghost Test enforced.',
  'beauty-skincare':  'BEAUTY · SKINCARE MODE — Cinematic close-ups, glowing skin textures, smooth product application transitions, flattering soft-box lighting. Ghost Test enforced.',
  'fitness':          'FITNESS · HEALTH MODE — Dynamic movement, sweat, muscle tension, transformation visible through posture and effort. High-energy cuts. Ghost Test enforced.',
  'cooking':          'FOOD · RECIPES MODE — Satisfying prep sequences, sizzle, steam, plating and warm kitchen energy. Macro food shots, natural light. Ghost Test enforced.',
  'fashion':          'FASHION · STYLE MODE — Confident outfit reveals, fabric movement, styling process. Clean editorial or street backgrounds. Ghost Test enforced.',
  'business':         'BUSINESS · FINANCE MODE — Professional ambition shown through purposeful action, boardroom energy, charts, handshakes and forward momentum. Ghost Test enforced.',
  'travel':           'TRAVEL · ADVENTURE MODE — Wide establishing shots of new environments, cultural details, wonder on face, spontaneous discovery. Golden hour preferred. Ghost Test enforced.',
  'parenting':        'PARENTING MODE — Tender family care through observable acts: feeding, teaching, comforting. Warm home lighting, genuine reactions. Ghost Test enforced.',
  'animation':        'ANIMATION MODE — Fluid stylized motion, expressive character faces, vivid palette, exaggerated physics for comedic or dramatic effect. Ghost Test enforced.',
  'motivation':       'MOTIVATION MODE — Raw determination, uplifting posture, sunrise/dawn energy, obstacle → breakthrough visual arc. High contrast lighting. Ghost Test enforced.',
  'comedy':           'COMEDY MODE — Precise comic timing, relatable situations, exaggerated reactions, deadpan delivery or slapstick depending on tone. Ghost Test enforced.',
};

export function getNichePrefill(toolId: string): string {
  return NICHE_PREFILLS[toolId] ?? '';
}

export function getNicheTool(toolId: string): NicheTool | undefined {
  return NICHE_TOOLS.find(t => t.id === toolId);
}
