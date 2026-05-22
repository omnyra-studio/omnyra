export const AVATAR_LIBRARY = [
  // FEMALE — PROFESSIONAL
  { id:"emma_pro",      name:"Emma",     category:"Professional", gender:"female",  style:"Corporate",     thumbnail:"/avatars/emma_pro.svg",
    klingPrompt:"professional woman in her 30s, business attire, confident smile, clean appearance" },
  { id:"sofia_exec",    name:"Sofia",    category:"Professional", gender:"female",  style:"Executive",     thumbnail:"/avatars/sofia_exec.svg",
    klingPrompt:"executive woman, elegant suit, authoritative yet warm, polished appearance" },
  { id:"maya_creative", name:"Maya",     category:"Creative",     gender:"female",  style:"Creative",      thumbnail:"/avatars/maya_creative.svg",
    klingPrompt:"creative young woman, artistic style, colorful aesthetic, expressive personality" },

  // FEMALE — CREATOR
  { id:"zoe_creator",   name:"Zoe",      category:"Creator",      gender:"female",  style:"Influencer",    thumbnail:"/avatars/zoe_creator.svg",
    klingPrompt:"young woman influencer, casual chic style, authentic energy, natural beauty" },
  { id:"lily_fitness",  name:"Lily",     category:"Fitness",      gender:"female",  style:"Athletic",      thumbnail:"/avatars/lily_fitness.svg",
    klingPrompt:"athletic woman, activewear, fit and energetic, approachable fitness vibe" },
  { id:"ava_tech",      name:"Ava",      category:"Tech",         gender:"female",  style:"Tech",          thumbnail:"/avatars/ava_tech.svg",
    klingPrompt:"tech-savvy woman, smart casual, intelligent expression, modern professional" },

  // MALE — PROFESSIONAL
  { id:"james_pro",     name:"James",    category:"Professional", gender:"male",    style:"Corporate",     thumbnail:"/avatars/james_pro.svg",
    klingPrompt:"professional man in his 30s, business casual, confident and trustworthy" },
  { id:"marcus_exec",   name:"Marcus",   category:"Professional", gender:"male",    style:"Executive",     thumbnail:"/avatars/marcus_exec.svg",
    klingPrompt:"executive man, well-dressed, authoritative presence, experienced leader" },
  { id:"alex_creator",  name:"Alex",     category:"Creator",      gender:"male",    style:"Creator",       thumbnail:"/avatars/alex_creator.svg",
    klingPrompt:"male content creator, casual style, relatable energy, natural charisma" },

  // MALE — CREATOR
  { id:"ryan_fitness",  name:"Ryan",     category:"Fitness",      gender:"male",    style:"Athletic",      thumbnail:"/avatars/ryan_fitness.svg",
    klingPrompt:"athletic man, activewear, fit physique, motivational energy" },
  { id:"dev_tech",      name:"Dev",      category:"Tech",         gender:"male",    style:"Tech",          thumbnail:"/avatars/dev_tech.svg",
    klingPrompt:"tech professional man, smart casual, analytical yet approachable" },
  { id:"chris_casual",  name:"Chris",    category:"Casual",       gender:"male",    style:"Casual",        thumbnail:"/avatars/chris_casual.svg",
    klingPrompt:"casual friendly man, everyday style, warm and relatable personality" },

  // DIVERSE
  { id:"nina_global",   name:"Nina",     category:"Global",       gender:"female",  style:"Multicultural", thumbnail:"/avatars/nina_global.svg",
    klingPrompt:"young multicultural woman, modern style, vibrant and confident energy" },
  { id:"kai_neutral",   name:"Kai",      category:"Neutral",      gender:"neutral", style:"Neutral",       thumbnail:"/avatars/kai_neutral.svg",
    klingPrompt:"gender-neutral presenter, contemporary fashion, inclusive modern aesthetic" },
  { id:"priya_pro",     name:"Priya",    category:"Professional", gender:"female",  style:"Corporate",     thumbnail:"/avatars/priya_pro.svg",
    klingPrompt:"South Asian professional woman, elegant business attire, warm confidence" },
  { id:"marcus_b",      name:"Marcus B", category:"Creator",      gender:"male",    style:"Urban",         thumbnail:"/avatars/marcus_b.svg",
    klingPrompt:"young Black man, urban streetwear, confident and charismatic energy" },
];

export const AVATAR_CATEGORIES = [...new Set(AVATAR_LIBRARY.map(a => a.category))];
