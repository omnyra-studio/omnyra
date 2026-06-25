export interface NicheTool {
  id: string;
  title: string;
  desc: string;
  icon: string;
  color: string;
}

export const NICHE_TOOLS: NicheTool[] = [
  { id: 'kindness',         title: 'Kindness',             desc: 'Acts of compassion, generosity, human connection',     icon: '🤝', color: 'from-amber-500 to-orange-500'  },
  { id: 'lifestyle',        title: 'Lifestyle',             desc: 'Daily life, routines, vlogs, authentic moments',       icon: '🌅', color: 'from-amber-500 to-yellow-500'  },
  { id: 'relationships',    title: 'Relationships',         desc: 'Love, dating, connection, emotional bonds',            icon: '❤️', color: 'from-red-500 to-pink-500'      },
  { id: 'friendships',      title: 'Friendships',           desc: 'Bonds, social life, support, laughter',               icon: '👥', color: 'from-indigo-500 to-blue-500'   },
  { id: 'spirituality',     title: 'Spirituality',          desc: 'Inner peace, mindfulness, faith, purpose',            icon: '🙏', color: 'from-purple-500 to-violet-500' },
  { id: 'self-improvement', title: 'Self Improvement',      desc: 'Growth, mindset, personal development',               icon: '🌱', color: 'from-blue-500 to-cyan-500'     },
  { id: 'motivation',       title: 'Motivation',            desc: 'Inspiration, success, hustle, resilience',            icon: '🔥', color: 'from-orange-500 to-red-500'    },
  { id: 'mental-health',    title: 'Mental Health',         desc: 'Wellness, mindfulness, emotional balance',            icon: '🧠', color: 'from-violet-500 to-purple-500' },
  { id: 'fitness',          title: 'Fitness',               desc: 'Workouts, health, transformation, discipline',        icon: '🏋️', color: 'from-emerald-500 to-teal-500'  },
  { id: 'beauty-skincare',  title: 'Beauty & Skincare',     desc: 'Glow-ups, routines, transformations',                 icon: '💄', color: 'from-pink-500 to-rose-500'     },
  { id: 'cooking',          title: 'Cooking & Food',        desc: 'Recipes, kitchen moments, food culture',              icon: '🍳', color: 'from-orange-500 to-amber-500'  },
  { id: 'fashion',          title: 'Fashion',               desc: 'Style, outfits, trends, aesthetics',                  icon: '👗', color: 'from-pink-500 to-purple-500'   },
  { id: 'business',         title: 'Business & Finance',    desc: 'Entrepreneurship, money, success',                    icon: '💼', color: 'from-cyan-500 to-blue-500'     },
  { id: 'travel',           title: 'Travel',                desc: 'Adventure, culture, exploration',                     icon: '✈️', color: 'from-teal-500 to-cyan-500'     },
  { id: 'parenting',        title: 'Parenting & Family',    desc: 'Family life, kids, home moments',                     icon: '👨‍👩‍👧', color: 'from-purple-500 to-violet-500' },
];

export const NICHE_PREFILLS: Record<string, string> = {
  'kindness':         'KINDNESS · HONESTY MODE — Deep emotional insight through subtle micro-expressions, presence, and quiet compassion. Natural lighting, warm golden hour, genuine human connection. Avoid on-screen text. Ghost Test enforced.',
  'lifestyle':        'LIFESTYLE · DAILY LIFE MODE — Natural, authentic everyday moments. Real settings, candid movement, soft natural light.',
  'relationships':    'RELATIONSHIPS · DATING MODE — Emotional connection shown through touch, glances, body language and quiet shared moments. Ghost Test enforced.',
  'friendships':      'FRIENDSHIPS MODE — Warm bonds shown through laughter, closeness and support. Ghost Test enforced.',
  'spirituality':     'SPIRITUALITY · WELLNESS MODE — Calm, mindful moments. Soft golden light, peaceful posture and breath. Ghost Test enforced.',
  'self-improvement': 'SELF IMPROVEMENT MODE — Visible transformation, determination, focused action and growth. Ghost Test enforced.',
  'motivation':       'MOTIVATION MODE — Raw determination, uplifting posture, sunrise/dawn energy, obstacle to breakthrough. High contrast lighting. Ghost Test enforced.',
  'mental-health':    'MENTAL HEALTH & WELLNESS MODE — Calm, safe environments. Breathing, mindfulness, stillness and healing. Ghost Test enforced.',
  'fitness':          'FITNESS & HEALTH MODE — Dynamic movement, sweat, muscle tension, transformation and effort. High-energy cuts. Ghost Test enforced.',
  'beauty-skincare':  'BEAUTY & SKINCARE MODE — Glowing skin textures, smooth application, confidence transformations. Ghost Test enforced.',
  'cooking':          'FOOD & RECIPES MODE — Satisfying prep, sizzle, steam, plating. Macro food shots, warm kitchen energy. Ghost Test enforced.',
  'fashion':          'FASHION · STYLE MODE — Confident movement, styling process, clean editorial or street backgrounds.',
  'business':         'BUSINESS & FINANCE MODE — Purposeful action, ambition, focused work. Professional yet warm lighting.',
  'travel':           'TRAVEL · ADVENTURE MODE — Wide establishing shots, discovery, golden hour. Sense of wonder.',
  'parenting':        'PARENTING MODE — Tender family moments: teaching, comforting, playing. Warm home lighting.',
};

export function getNichePrefill(toolId: string): string {
  return NICHE_PREFILLS[toolId] ?? '';
}

export function getNicheTool(toolId: string): NicheTool | undefined {
  return NICHE_TOOLS.find(t => t.id === toolId);
}
