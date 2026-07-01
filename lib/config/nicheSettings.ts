export interface NichePlaybook {
  hookStyles: string[];
  pacing: string;
  visualStyle: string;
  narrationTone: string;
  ctaExamples: string[];
  recommendedLength: string;
  keyElements: string[];
  retentionHooks: string[];
}

export interface NicheSettings {
  name: string;
  key: string;
  environmentContext?: string; // injected into Runway video prompt for environmental grounding
  /**
   * Classification priority — HIGHER number = HIGHER priority in tie-breaking.
   * When two niches score within TIE_THRESHOLD of the top score, the highest
   * priority niche wins. Prevents high-sensitivity categories from being displaced
   * by overlapping keywords in adjacent categories.
   *
   *  12 — mental_health        (highest sensitivity: wellness/motivation overlap)
   *  10 — finance_investing    (protect from side_hustles overlap)
   *   9 — tech_ai              (strong keyword dominance)
   *   8 — side_hustles, relationships_dating
   *   7 — motivation_success, faceless_stoic
   *   6 — health_fitness, product_reviews, animation_3d
   *   5 — beauty_skincare, gaming, tech_ai
   *   4 — food_recipes, pets
   *   3 — luxury_lifestyle
   *   1 — lifestyle (fallback only — never shown in dropdown)
   */
  priority: number;
  triggerKeywords: string[];
  negativeKeywords: string[];
  imagePromptPrefix: string;
  videoPromptPrefix: string;
  negativePrompt: string;
  cinemaStyle: string;
  defaultDuration: number;
  lightningModeDefault: boolean;
  eraDetection: boolean;
  emotionalArc: string;
  environmentInclude: string;
  environmentExclude: string;
  voiceoverTemplate?: string;
  playbook: NichePlaybook;
}

export const NICHE_SETTINGS: Record<string, NicheSettings> = {

  motivation_success: {
    name: 'Motivation / Success',
    key: 'motivation_success',
    priority: 7,
    triggerKeywords: ['motivation', 'motivational', 'inspiration', 'empowering', 'inspirational', 'overcome obstacles', 'mindset shift', 'discipline', 'transformation', 'breakthrough', 'never give up', 'grind', 'hustle', 'push through', 'no excuses', 'rise up', 'keep going', 'beast mode', 'mindset', 'winner', 'success', 'success mindset', 'self improvement', 'productivity', 'focus', 'ambition'],
    negativeKeywords: ['depression', 'hopeless', 'failure story', 'burnout crisis', 'depressing', 'lazy', 'low energy', 'chaotic', 'defeatist', 'giving up', 'quitting'],
    imagePromptPrefix: 'Aspirational and powerful. Person demonstrating effort, focus, determination through physical action. Golden hour or dramatic contrast lighting.',
    videoPromptPrefix: 'Cinematic motivational moment. Last frame reference: maintain character pose, clothing, and golden hour lighting exactly. Motion: deliberate forward walk, arms swinging with purpose, rising from ground. Roger Deakins golden hour backlighting, high contrast shadows. Camera: slow push-in building to emotional close-up.',
    negativePrompt: 'lazy, sitting idle, dark depressing, cluttered mess, giving up, slouching, defeated, crying alone',
    cinemaStyle: 'Energetic, golden hour lighting, powerful close-ups, dynamic camera movement, high contrast, forward momentum',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Struggle → Breakthrough → Triumph',
    environmentInclude: 'Outdoor sunrise or sunset, mountain peak, running track, empty road stretching ahead, gym at dawn, rooftop with city skyline, open field, staircase, boxing ring, weight room',
    environmentExclude: 'Couch, bed, messy room, dark basement, cluttered desk, junk food, TV screen, gaming chair, nightclub',
    voiceoverTemplate: "Most people quit right before the breakthrough. They give up on day 29 of a 30-day challenge. They stop one rejection away from a yes. The only difference between those who make it and those who don't? They kept going. Don't stop now.",
    playbook: {
      hookStyles: ['The harsh truth', 'Never give up story', 'Powerful quote'],
      pacing: 'Building intensity to emotional peak',
      visualStyle: 'Epic, cinematic, slow motion, text overlays',
      narrationTone: 'Deep, inspiring, emotional',
      ctaExamples: ['Save & Share', 'Tag someone who needs this'],
      recommendedLength: '30-60s',
      keyElements: ['Emotional arc', 'Inspirational visuals'],
      retentionHooks: ['Powerful opening quote', 'Silence before the peak', 'Slow-motion climax moment'],
    },
  },

  finance_investing: {
    name: 'Personal Finance & Investing',
    key: 'finance_investing',
    priority: 10,
    triggerKeywords: ['personal finance', 'investing', 'compound interest', 'financial freedom', 'wealth building', 'passive income', 'smart investing', 'budget', 'saving money', 'debt free', 'stocks', 'index fund', 'retirement', 'net worth', 'crypto', 'portfolio', 'wealth building'],
    negativeKeywords: ['get rich quick', 'guaranteed profit', 'scam', 'gambling', 'guaranteed returns', 'pyramid'],
    imagePromptPrefix: 'Clean professional financial setting. Laptop with investment dashboard, home office, charts showing growth. Real person managing their finances.',
    videoPromptPrefix: 'Cinematic finance moment. Last frame continuity: preserve character, home office environment, and warm practical lighting. Motion: deliberate working actions — typing, reviewing charts, phone earnings check. Roger Deakins warm practical indoor light. Camera: purposeful tracking following the work flow naturally.',
    negativePrompt: 'luxury mansion, yacht, lamborghini, casino, private jet, unrealistic wealth, pyramid scheme, gambling',
    cinemaStyle: 'Warm and trustworthy, natural indoor lighting, clean compositions, authentic wealth-building feel',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Plan → Progress',
    environmentInclude: 'Home desk with laptop showing portfolio, phone with banking app, notebook with financial plan, organised filing, charts showing compound growth',
    environmentExclude: 'Luxury car, private jet, mansion, casino chips, passive beach lounging, pyramid scheme whiteboard',
    voiceoverTemplate: "I started investing $[amount] a month at [age] and here's what compound interest actually does. Year 1: [result]. Year 10: [result]. Year 30: [result]. The best time to start was yesterday. The second best time is right now.",
    playbook: {
      hookStyles: ['Compound interest explained', 'The investing mistake costing you'],
      pacing: 'Clear step-by-step with visuals',
      visualStyle: 'Clean, professional, charts + real life',
      narrationTone: 'Trustworthy, practical, calm',
      ctaExamples: ['Save this before you invest', "Comment 'YES' for the full guide"],
      recommendedLength: '20-45s',
      keyElements: ['Numbers', 'Compound growth', 'Actionable steps'],
      retentionHooks: ['Dollar amount in hook', 'Growth chart reveal', 'Simple math that shocks'],
    },
  },

  side_hustles: {
    name: 'Side Hustles & Money Making',
    key: 'side_hustles',
    priority: 8,
    triggerKeywords: ['side hustle', 'make money online', 'passive income', 'from home', 'scalable', 'easy side hustle', 'extra money', 'freelance', 'dropshipping', 'reselling', 'digital products', 'online income', 'earn from home', 'extra income', 'digital business', 'income stream', 'freelancing'],
    negativeKeywords: ['illegal scheme', 'saturated market claim', 'instant wealth', 'illegal', 'pyramid'],
    imagePromptPrefix: 'Clean home office or laptop environment. Person working on their side business from home. Phone showing earnings, packaging orders, or working on creative projects.',
    videoPromptPrefix: 'Cinematic side hustle moment. Continue from last frame: preserve character, home environment, and warm practical lighting. Motion: working actions — order packing, laptop earnings check, phone showing income notification. Roger Deakins warm indoor window light. Camera: following the hustle flow.',
    negativePrompt: 'luxury mansion, yacht, unrealistic wealth, pyramid scheme, casino, misleading income screenshots',
    cinemaStyle: 'Warm, real, authentic home business aesthetic, natural lighting, trustworthy',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Idea → Action → Income',
    environmentInclude: 'Home desk with laptop, shipping supplies and label printer, phone with income app, notebook with business plan, organised workspace',
    environmentExclude: 'Luxury car, private jet, casino chips, pyramid scheme whiteboard, mansions',
    voiceoverTemplate: "I made an extra $[amount] this month with zero experience. Here's exactly how: [Step 1]. [Step 2]. [Step 3]. You don't need followers, investment, or special skills. This is the side hustle nobody's talking about yet.",
    playbook: {
      hookStyles: ['I made $X with $0', 'The side hustle no one talks about'],
      pacing: 'Clear step-by-step',
      visualStyle: 'Clean, authentic, screen + real life',
      narrationTone: 'Excited, practical, trustworthy',
      ctaExamples: ['Link in bio', "Comment 'HUSTLE' for guide"],
      recommendedLength: '20-45s',
      keyElements: ['Numbers', 'Proof', 'Actionable steps'],
      retentionHooks: ['Income screenshot', 'Dollar amount hook', 'Step-by-step reveal'],
    },
  },

  health_fitness: {
    name: 'Health & Fitness',
    key: 'health_fitness',
    priority: 6,
    triggerKeywords: ['health', 'fitness', 'workout', 'gym', 'exercise', 'home workout', 'transformation', 'sustainable fitness', 'energy boost', 'discipline', 'lift', 'squat', 'deadlift', 'cardio', 'hiit', 'muscle', 'weight loss', 'training', 'fat loss', 'muscle gain', 'fitness plan', 'calories', 'protein', 'training routine', 'fitness transformation', 'gym routine', 'strength'],
    negativeKeywords: ['extreme diet', 'eating disorder', 'injury instructions', 'unrealistic body', 'injury advice'],
    imagePromptPrefix: 'Gym or outdoor training environment. Athletic person mid-exercise. Visible effort, form, and determination. Energetic and aspirational.',
    videoPromptPrefix: 'Motivational fitness transformation. Last frame reference: maintain identical character, athletic clothing, and lighting exactly. Motion: explosive athletic effort — peak lift, powerful run stride, jump form. Roger Deakins dramatic natural lighting. Camera: slow-motion on peak effort, dynamic pull-back to reveal full athletic form.',
    negativePrompt: 'sedentary, sitting, desk, office, cooking, sleeping, relaxing, spa, meditation cushion, pajamas, extreme diet pills',
    cinemaStyle: 'High contrast, dramatic gym lighting, dynamic angles, slow-motion on effort moments',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Challenge → Effort → Achievement',
    environmentInclude: 'Gym floor with squat rack and plates, rubber mat, dumbbells, pull-up bar, running track, outdoor park workout area, kettlebells, gym mirror',
    environmentExclude: 'Couch, bed, dining table, office desk, cooking kitchen, beauty vanity, meditation cushion, spa',
    voiceoverTemplate: "Stop skipping the gym. Here's the 3-move workout that changed everything for me. [Move 1] for [reps]. [Move 2] for [reps]. [Move 3] for [reps]. No equipment needed. Do this every morning and watch what happens in 30 days.",
    playbook: {
      hookStyles: ['Day 1 vs Day 30', 'This changed my body', 'Try this workout'],
      pacing: 'Fast cuts, high energy, 1-2 second shots',
      visualStyle: 'Sweat, gym lighting, dynamic angles, slow-mo on lifts',
      narrationTone: 'Motivational, energetic, direct',
      ctaExamples: ['Save this workout', 'Tag your gym buddy'],
      recommendedLength: '15-30s',
      keyElements: ['Transformation', 'Determination', 'Before/After'],
      retentionHooks: ['Before/After reveal', 'Countdown timer', 'Personal record moment'],
    },
  },

  beauty_skincare: {
    name: 'Beauty / Skincare / Makeup',
    key: 'beauty_skincare',
    priority: 5,
    triggerKeywords: ['beauty', 'skincare', 'makeup', 'glowing skin', 'skincare routine', 'glass skin', 'natural beauty', 'self-care', 'foundation', 'lipstick', 'serum', 'moisturizer', 'glow', 'routine', 'concealer', 'contour', 'eyeshadow', 'blush', 'cleanser', 'spf', 'makeup routine', 'beauty tips', 'acne treatment', 'cosmetics'],
    negativeKeywords: ['heavy filter', 'fake results', 'body shame', 'caked makeup', 'toxic', 'heavy filters', 'unrealistic'],
    imagePromptPrefix: 'Clean beauty environment. Vanity mirror, bright even lighting, products arranged neatly, skin close-ups. Person applying or showcasing product with dewy glowing result.',
    videoPromptPrefix: 'Luxurious beauty routine. Last frame continuity: preserve character, skincare products, and flattering lighting exactly. Motion: precise hand gestures — serum application, smooth blending, gentle tapping on dewy skin. Roger Deakins warm ring-light quality lighting. Camera: extreme close-up on skin texture and product application, pull back to glowing reveal.',
    negativePrompt: 'dirty, greasy, mechanic, engine, war, blood, sweat, mud, construction site, welding, gym sweat, caked on heavy makeup',
    cinemaStyle: 'Bright clean, ring-light quality, warm skin tones, extreme close-ups on skin and product',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Before → Process → Glow',
    environmentInclude: 'Vanity mirror with ring light, bathroom counter with products arranged, cotton pads and serums, face close-up with dewy skin, makeup palette open, brush set, clean white towel',
    environmentExclude: 'Garage, engine grease, construction site, muddy field, sweaty gym, dark industrial space',
    voiceoverTemplate: "I tried [product/routine] for 30 days. Here's what actually happened to my skin. Week 1: [observation]. Week 2: [change]. By week 4: [result]. The one product I'll never stop using? [Product]. Your skin will thank you.",
    playbook: {
      hookStyles: ['This changed my skin', '5-minute glow up'],
      pacing: 'Fast transformation',
      visualStyle: 'Close-ups, clean, bright lighting',
      narrationTone: 'Friendly, tutorial',
      ctaExamples: ['Try this routine'],
      recommendedLength: '15-30s',
      keyElements: ['Before/After', 'Close-ups', 'Natural ingredients'],
      retentionHooks: ['Skin transformation reveal', 'Ingredient surprise', 'Satisfying application ASMR'],
    },
  },

  food_recipes: {
    name: 'Food & Recipes',
    key: 'food_recipes',
    priority: 4,
    triggerKeywords: ['food', 'recipe', 'cooking', 'baking', 'meal prep', 'easy recipes', 'appetizing', 'comfort food', 'high protein', 'chef', 'kitchen', 'ingredient', 'dish', 'dessert', 'pasta', 'steak', 'salad', 'breakfast', 'dinner', 'easy dinner', 'high protein meal', 'food hacks'],
    negativeKeywords: ['burnt food', 'unsafe cooking', 'gross food', 'messy', 'bland', 'expensive ingredients'],
    imagePromptPrefix: 'Kitchen or dining environment. Ingredients on counter, cooking in progress, finished plated dish. Warm steam, fresh textures, vibrant food colours.',
    videoPromptPrefix: 'Cinematic recipe moment. Last frame reference: preserve chef character, kitchen environment, and warm practical lighting. Motion: skilled chopping rhythm, stirring bubbling pot, precise plating. Roger Deakins warm overhead kitchen light with visible steam and food texture. Camera: close-up on food action, pull back to reveal complete finished dish.',
    negativePrompt: 'laboratory, medical, gaming setup, office desk, gym, car, battle, weapon, dirty environment, messy burnt food',
    cinemaStyle: 'Warm appetising tones, overhead and close-up angles, steam and texture visible, cozy kitchen lighting',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Prep → Cook → Serve',
    environmentInclude: 'Kitchen counter with ingredients prepped, cutting board with knife and vegetables, stovetop with pan and steam, oven with golden bake visible, plated dish on table, herbs and spices',
    environmentExclude: 'Laboratory, medical equipment, gym weights, gaming monitor, car engine, office printer',
    voiceoverTemplate: "This [dish] takes 10 minutes and tastes like you ordered it from a restaurant. Here's how: [Step 1]. [Step 2]. Secret ingredient: [ingredient]. Plate it, taste it, send it to someone you want to impress. You're welcome.",
    playbook: {
      hookStyles: ['5-minute recipe', 'Viral food hack'],
      pacing: 'Step-by-step fast',
      visualStyle: 'Close-up food shots, satisfying',
      narrationTone: 'Clear instructions',
      ctaExamples: ['Save this recipe'],
      recommendedLength: '15-30s',
      keyElements: ['ASMR food', 'Quick recipes'],
      retentionHooks: ['Satisfying food close-up', 'Unexpected ingredient', 'Final dish reveal'],
    },
  },

  product_reviews: {
    name: 'Product Reviews & Launches',
    key: 'product_reviews',
    priority: 6,
    triggerKeywords: ['product review', 'honest review', 'unboxing', 'worth the money', 'before after', 'premium quality', 'tested', 'review', 'gadget review', 'buying guide', 'pros and cons', 'verdict', 'first look', 'worth it', 'best product', 'comparison', 'test results'],
    negativeKeywords: ['fake review', 'sponsored manipulation', 'misleading ad', 'fake review', 'sponsored bias', 'clickbait'],
    imagePromptPrefix: 'Clean product presentation. Product centered on neutral surface, unboxed, well-lit. Person examining or using product. Professional and trustworthy setting.',
    videoPromptPrefix: 'Honest product review moment. Last frame continuity: keep product, reviewer character, and clean studio setting consistent. Motion: deliberate unboxing reveal, product rotation for full view, key feature demonstration. Roger Deakins clean neutral studio light. Camera: close-up on product detail, pull back to reviewer honest reaction.',
    negativePrompt: 'fake review, broken product, misleading angle, hidden defect, sponsored bias obvious, cluttered messy background, blurry product',
    cinemaStyle: 'Clean neutral tones, product lighting, crisp close-ups on features, honest unboxing aesthetic',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Curiosity → Discovery → Verdict',
    environmentInclude: 'Clean table or desk with product as hero, neutral background, good product lighting, packaging open beside product, hands holding product, close-up on key features',
    environmentExclude: 'Cluttered messy room, broken items, misleading visuals, casino, distracting products',
    voiceoverTemplate: "I bought the [product] so you don't have to. Here's what I love: [pros]. What surprised me: [unexpected detail]. The one downside: [con]. Is it worth the money? Here's my honest verdict.",
    playbook: {
      hookStyles: ['I bought it so you don\'t have to', 'Honest review after 30 days', 'Worth it or waste of money?'],
      pacing: 'Feature-by-feature, clear verdict',
      visualStyle: 'Clean unboxing, close-up features, comparison shots',
      narrationTone: 'Honest, measured, trustworthy',
      ctaExamples: ['Comment your questions', 'Link in bio'],
      recommendedLength: '30-60s',
      keyElements: ['Unboxing', 'Feature demo', 'Final verdict'],
      retentionHooks: ['Price reveal hook', 'Unexpected flaw reveal', 'Before/after usage comparison'],
    },
  },

  faceless_stoic: {
    name: 'Faceless Motivation / Stoic Content',
    key: 'faceless_stoic',
    priority: 7,
    triggerKeywords: ['stoic', 'stoicism', 'faceless', 'marcus aurelius', 'discipline', 'silence', 'solitude', 'control what you can', 'obstacle is the way', 'memento mori', 'no excuses', 'hard work', 'dark motivation', 'sigma', 'monk mode', 'masculinity', 'iron mind', 'let them go', 'inner peace', 'mental resilience', 'discipline mindset', 'silent motivation', 'detachment'],
    negativeKeywords: ['drama', 'victim mindset', 'chaotic energy', 'victim mentality', 'loud hype', 'luxury flexing', 'dancing', 'party', 'comedy', 'gossip'],
    imagePromptPrefix: 'Dramatic faceless or silhouetted figure. Epic landscape — mountain peak, open road at dawn, stormy coastline, dark forest clearing. No identifiable face. Power and solitude.',
    videoPromptPrefix: 'Faceless stoic cinematic moment. Last frame reference: preserve silhouette position, coat, and moody landscape lighting exactly. Motion: slow deliberate forward walk, wind through coat fabric, rain streaking, mist rolling across landscape. Roger Deakins moody desaturated backlighting, single warm accent. Camera: ultra-slow pull-back revealing full epic landscape scale.',
    negativePrompt: 'luxury flex, dancing, party, comedy sketch, gossip, bright happy colors, celebrity face, smiling selfie, victim mentality, emotional drama, loud hype, chaotic background',
    cinemaStyle: 'Dark cinematic, desaturated with single warm accent, epic wide shots, slow motion, heavy shadow, atmospheric mist or rain',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Struggle → Clarity → Resolve',
    environmentInclude: 'Mountain peak at sunrise, open empty road stretching ahead, dark forest path with single light source, stormy coastline, silhouette against epic sky',
    environmentExclude: 'Luxury cars, parties, celebrity brands, bright cheerful setting, dancing, comedy props, busy social scene',
    voiceoverTemplate: "The obstacle is the way. You don't control what happens to you — only how you respond. Most people quit when it gets hard. The few who don't become unstoppable. Discipline is not punishment. Discipline is freedom.",
    playbook: {
      hookStyles: ['The hard truth no one tells you', 'Silence is a weapon', 'While you were sleeping'],
      pacing: 'Slow, building intensity, dramatic pauses',
      visualStyle: 'Dark cinematic, silhouettes, epic landscapes, quote overlays',
      narrationTone: 'Deep, measured, powerful, philosophical',
      ctaExamples: ['Share with someone who needs this', 'Follow for daily discipline'],
      recommendedLength: '30-60s',
      keyElements: ['Epic visuals', 'Philosophical quotes', 'No face shown'],
      retentionHooks: ['Powerful opening silence', 'Quote drop over epic visual', 'Slow reveal of landscape'],
    },
  },

  luxury_lifestyle: {
    name: 'Luxury Lifestyle',
    key: 'luxury_lifestyle',
    priority: 3,
    triggerKeywords: ['luxury', 'luxury aesthetic', 'dream life', 'high-end', 'elegant', 'aspirational', 'designer', 'premium', 'exclusive', 'penthouse', 'rolex', 'gucci', 'ferrari', 'lamborghini', 'yacht', 'private jet', 'first class', 'fine dining', 'champagne', 'high-end lifestyle', 'wealth aesthetic', 'expensive lifestyle'],
    negativeKeywords: ['cheap look', 'fake luxury', 'class criticism', 'tacky', 'budget', 'frugal', 'broken', 'damaged'],
    imagePromptPrefix: 'Pristine luxury environment. Immaculate interiors, polished surfaces, premium materials — marble, leather, crystal, gold accents. Everything clean, new, aspirational.',
    videoPromptPrefix: 'Aspirational luxury lifestyle. Last frame continuity: preserve elegant character and premium environment perfectly. Motion: slow deliberate luxury gestures — champagne reach, marble floor walk, ocean view gaze. Roger Deakins golden hour through floor-to-ceiling glass. Camera: smooth slow dolly tracking elegant movement with shallow depth of field.',
    negativePrompt: 'blur, tacky, cheap looking, poor taste, unstable motion, low quality, broken, damaged, rusted, cluttered, poverty, discount, fast food',
    cinemaStyle: 'High-end cinematic, golden hour lighting, rich elegant color palette, sophisticated atmosphere, shallow depth of field, subtle film grain',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Aspiration → Experience → Indulgence',
    environmentInclude: 'Marble floor, crystal chandelier, leather seating, gold accents, polished surfaces, penthouse view, designer boutique interior, champagne glass, silk fabric',
    environmentExclude: 'Broken items, rust, peeling paint, trash, budget store, plastic furniture, worn carpet, fast food, junkyard',
    voiceoverTemplate: "This is the luxury lifestyle most only dream of. Wake up with intention, move through your day with purpose. [Detail 1]. [Detail 2]. Because success isn't just what you earn — it's how you live.",
    playbook: {
      hookStyles: ['POV: Living like this', 'Dream home tour'],
      pacing: 'Slow, luxurious',
      visualStyle: 'Golden hour, clean aesthetics, high production',
      narrationTone: 'Smooth, dreamy, aspirational',
      ctaExamples: ['Would you live here?', 'Dream bigger'],
      recommendedLength: '15-30s',
      keyElements: ['Aspirational visuals', 'Details'],
      retentionHooks: ['Slow reveal of luxury item', 'Price drop at end', 'Unexpected interior shot'],
    },
  },

  tech_ai: {
    name: 'Technology & AI',
    key: 'tech_ai',
    priority: 9,
    triggerKeywords: ['technology', 'tech', 'ai', 'artificial intelligence', 'future tech', 'ai explained', 'innovation', 'futuristic', 'game-changing', 'robot', 'gadget', 'app', 'software', 'coding', 'machine learning', 'automation', 'drone', 'smart home', 'startup', 'GPT', 'future tech'],
    negativeKeywords: ['outdated tech', 'buggy system', 'useless tool', 'outdated', 'medieval', 'ancient', 'historical'],
    imagePromptPrefix: 'Modern tech environment. Clean desk with multiple monitors, code on screen, devices, modern workspace. Person interacting with technology.',
    videoPromptPrefix: 'Futuristic tech explainer. Last frame continuity: maintain professional character, tech environment, and neon-accented lighting exactly. Motion: precise hands on holographic interface, screen swipes, data point gestures. Blade Runner–Deakins neon-clean hybrid lighting. Camera: controlled orbit around the demonstration, slow push-in on key screen reveal.',
    negativePrompt: 'blur, outdated, buggy visuals, chaotic, low quality, distortion, medieval, ancient, rustic, farmhouse, candle, handwritten',
    cinemaStyle: 'Sleek futuristic cinematic, neon and clean lighting accents, sharp focus, cool blue tones, innovative atmosphere',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Innovation → Future',
    environmentInclude: 'Multiple monitors with code or UI, mechanical keyboard, clean desk with devices, server rack lights, drone on desk, smart home devices, VR headset',
    environmentExclude: 'Rustic cabin, farmhouse, candlelit room, handwritten notes only, medieval setting, no-technology environment',
    voiceoverTemplate: "This groundbreaking AI tool is changing everything. Here's exactly how it works and how you can use it today. [Step 1]. [Step 2]. And this feature? Nobody's talking about it yet. [Unexpected capability]. The future is already here.",
    playbook: {
      hookStyles: ['This changes everything', 'New AI just dropped'],
      pacing: 'Fast, demo-focused',
      visualStyle: 'Futuristic, sleek, screen recordings',
      narrationTone: 'Excited, explanatory',
      ctaExamples: ['Which one surprised you?'],
      recommendedLength: '20-40s',
      keyElements: ['Demos', 'Future vision'],
      retentionHooks: ['Live demo result', 'Shocking capability reveal', 'Before/after with AI'],
    },
  },

  relationships_dating: {
    name: 'Relationships & Dating',
    key: 'relationships_dating',
    environmentContext: 'wet sand beach shoreline, golden hour light, shallow ocean waves, warm amber atmosphere',
    priority: 8,
    triggerKeywords: ['relationship', 'dating', 'healthy relationships', 'dating advice', 'communication', 'red flags', 'love', 'couple', 'marriage', 'partner', 'romance', 'anniversary', 'soulmate', 'boyfriend', 'girlfriend', 'green flags', 'attachment style', 'breakup', 'attraction', 'kindness', 'compassion', 'empathy', 'caring', 'care for others', 'friendship', 'trust', 'vulnerability', 'intimacy', 'connection', 'bond', 'heartbreak', 'social skills', 'people skills', 'communication skills', 'longing', 'emotional connection'],
    negativeKeywords: ['toxic manipulation', 'control tactics', 'emotional abuse advice', 'manipulation tactics', 'coercion', 'revenge', 'cheating exposed'],
    imagePromptPrefix: 'Intimate warm setting. Two people sharing a genuine moment. Home, park, restaurant, beach. Authentic connection visible in body language.',
    videoPromptPrefix: 'Heartfelt relationship moment. Last frame reference: preserve both characters, warm intimate setting, and golden light perfectly. Motion: gentle hand reach, natural lean-in, shared glance with authentic smile. Roger Deakins soft warm golden light. Camera: intimate smooth tracking during conversation, gentle push-in on the emotional connection.',
    negativePrompt: 'blur, toxic drama, exaggerated motion, arguing, fighting, screaming, violence, courtroom, lawyer, angry, revenge',
    cinemaStyle: 'Warm cinematic, soft natural lighting, emotional yet tasteful atmosphere, golden tones, intimate close-ups',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Connection → Tension → Resolution',
    environmentInclude: 'Park bench for two, dinner table with candles, kitchen cooking together, couch with blanket, walking path, beach shoreline, car interior conversation',
    environmentExclude: 'Courtroom, lawyer office, violent scene, dark lonely room, broken glass',
    voiceoverTemplate: "Stop chasing the wrong connections. The real secret to lasting relationships is [insight]. [Key truth 1]. [Key truth 2]. And this one changes everything: [core principle]. When you get this right, everything else falls into place.",
    playbook: {
      hookStyles: ['The sign they\'re the one', 'Relationship red flags'],
      pacing: 'Emotional storytelling',
      visualStyle: 'Warm tones, couples, daily moments',
      narrationTone: 'Relatable, heartfelt',
      ctaExamples: ['Tag your person'],
      recommendedLength: '15-45s',
      keyElements: ['Relatability', 'Emotional moments'],
      retentionHooks: ['Relatable situation setup', 'Unexpected green/red flag', 'Emotional music drop'],
    },
  },

  mental_health: {
    name: 'Mental Health & Wellness',
    key: 'mental_health',
    priority: 12,
    triggerKeywords: ['mental health', 'anxiety relief', 'mindfulness', 'self-love', 'inner peace', 'calm', 'therapy', 'self care', 'boundaries', 'healing', 'trauma', 'burnout', 'overwhelm', 'coping', 'breathing exercise', 'journaling', 'anxiety', 'stress relief', 'stress', 'emotional wellbeing', 'emotional balance', 'self love', 'psychology', 'psychological', 'counseling', 'counselling', 'therapist', 'mental wellness', 'wellbeing', 'well-being', 'emotional health', 'emotional intelligence', 'self-awareness', 'meditation', 'depression', 'sadness', 'grief', 'loneliness', 'lonely', 'panic attack', 'mental clarity', 'emotional regulation', 'nervous system', 'inner work', 'shadow work'],
    negativeKeywords: ['self harm', 'triggering content', 'graphic distress', 'triggering', 'dark', 'horror', 'violence'],
    imagePromptPrefix: 'Calm safe environment. Soft lighting, comfortable space, journal and pen, nature, warm blanket, tea. Person in peaceful introspective moment.',
    videoPromptPrefix: 'Calming mental health moment. Last frame continuity: preserve serene character, peaceful space, and soft diffused lighting exactly. Motion: gentle breathing — chest rising slowly, hands softly releasing tension, subtle peaceful head tilt. Roger Deakins soft diffused natural morning light. Camera: ultra-slow push-in to peaceful face.',
    negativePrompt: 'blur, triggering visuals, dark tones, chaotic motion, loud, aggressive, party, horror, violence, screaming, chaos',
    cinemaStyle: 'Soft serene cinematic, gentle diffused lighting, peaceful muted color tones, very slow camera movement, intimate and safe',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Struggle → Awareness → Peace',
    environmentInclude: 'Cozy corner with blanket and journal, window seat with rain outside, nature path alone, warm cup of tea in hands, sunrise view from bed, calm water reflection',
    environmentExclude: 'Loud party, extreme sports, horror imagery, violent scene, chaotic crowd, aggressive confrontation',
    voiceoverTemplate: "It's okay not to be okay. Try this simple technique when anxiety rises: [Step 1]. [Step 2]. [Step 3]. You don't have to have it all together right now. Just breathe. One moment at a time. You've got this.",
    playbook: {
      hookStyles: ["You're not alone", 'One thing that helped me'],
      pacing: 'Calm and gentle',
      visualStyle: 'Soft lighting, nature, minimal',
      narrationTone: 'Warm, empathetic, supportive',
      ctaExamples: ['Save for later', "You're not alone"],
      recommendedLength: '30-60s',
      keyElements: ['Emotional connection', 'Hope'],
      retentionHooks: ['Relatable confession opener', 'Pause of silence', 'Soft music swell'],
    },
  },

  gaming: {
    name: 'Gaming',
    key: 'gaming',
    priority: 5,
    triggerKeywords: ['gaming', 'gamer', 'game', 'epic gameplay', 'tips', 'strategies', 'immersive', 'pro moves', 'esports', 'fps', 'rpg', 'twitch', 'stream', 'ranked', 'gameplay', 'loadout', 'meta', 'console', 'pc gaming', 'fortnite', 'minecraft', 'valorant', 'walkthrough', 'strategy', 'pro plays', 'gaming tips'],
    negativeKeywords: ['toxic gaming', 'spoilers', 'low effort gameplay', 'toxic', 'low quality'],
    imagePromptPrefix: 'Dynamic gaming environment. Person at high-end gaming setup — RGB keyboard, multiple monitors showing game, headset on. Intense focused expression.',
    videoPromptPrefix: 'Cinematic gaming moment. Last frame reference: maintain game world, character, and dynamic RGB lighting exactly. Motion: intense focused hands on controller/keyboard, rapid eye tracking, dramatic victory reaction. Dynamic RGB monitor glow with Deakins cinematic lighting. Camera: fast controlled track on player reaction, cut to gameplay highlight.',
    negativePrompt: 'blur, low graphics, chaotic jitter, low quality, toxic behavior, spoilers, generic office, static boring setup',
    cinemaStyle: 'Vibrant cinematic gaming aesthetic, dramatic in-game lighting, high detail textures, energetic RGB glow, shallow DOF on player reaction',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Challenge → Skill → Victory',
    environmentInclude: 'Gaming desk with RGB lighting, multiple monitors showing gameplay, mechanical keyboard, gaming mouse, headset, gaming chair, controller, streaming setup',
    environmentExclude: 'Office cubicle, outdoor field, kitchen, cooking setup, meditation space, blank white room',
    voiceoverTemplate: "Here's how to dominate in [game] as a beginner. Watch this powerful strategy in action. [Strategy 1]. [Strategy 2]. Most players miss this completely: [hidden tip]. Use this every game and watch your rank climb.",
    playbook: {
      hookStyles: ['Rank up fast', 'This broke my game', 'The pro trick nobody uses'],
      pacing: 'Fast cuts, reaction-focused',
      visualStyle: 'RGB dynamic, monitor glow, gameplay overlay',
      narrationTone: 'Excited, knowledgeable, casual',
      ctaExamples: ['Drop your main in comments', 'Follow for daily strats'],
      recommendedLength: '20-45s',
      keyElements: ['Gameplay highlights', 'Strategy reveal', 'Victory moment'],
      retentionHooks: ['Clutch moment opener', 'Rank reveal', 'Unexpected pro tip'],
    },
  },

  pets: {
    name: 'Pets',
    key: 'pets',
    priority: 4,
    triggerKeywords: ['pet', 'pets', 'cute pets', 'training', 'wholesome', 'adoption', 'heartwarming', 'dog', 'cat', 'puppy', 'kitten', 'animal', 'vet', 'rescue', 'breed', 'leash', 'collar', 'treat', 'pet food', 'bird', 'hamster', 'dog training', 'cat behavior', 'animal care', 'wholesome pets'],
    negativeKeywords: ['animal abuse', 'neglect', 'harmful behavior', 'cruelty', 'aggression', 'hunting', 'slaughter', 'animal testing', 'fight'],
    imagePromptPrefix: 'Pet-friendly environment. Home, park, vet clinic, garden. Animal as primary subject — adorable, healthy, active. Human-animal bond visible.',
    videoPromptPrefix: 'Wholesome pet moment. Last frame reference: preserve pet appearance, owner, and home environment exactly. Motion: joyful pet movement — running, tail wagging, trick execution, excited greeting jump. Roger Deakins warm natural sunlight through window. Camera: gentle handheld following pet movement, close-up on expressive animal eyes and face.',
    negativePrompt: 'blur, aggression, poor conditions, unnatural motion, hunting, animal harm, cramped cages, abuse, neglect, taxidermy',
    cinemaStyle: 'Warm heartfelt cinematic, natural soft lighting, focus on animal eyes and expressions, gentle camera following playful movement',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Meet → Bond → Joy',
    environmentInclude: 'Living room floor with pet toys, park grass with dog running, cat tree near window, pet bed with sleeping animal, food bowl being filled, garden with pet exploring',
    environmentExclude: 'Animal testing lab, hunting scene, cramped cage, slaughterhouse, taxidermy, animal fight ring, neglected dirty kennel',
    voiceoverTemplate: "Training your [pet] to [command] in just days. Every pet deserves love and guidance. Here's the method that actually works: [Step 1]. [Step 2]. [Step 3]. Watch the difference it makes. Start today.",
    playbook: {
      hookStyles: ['Cute + useful tip', 'Every pet owner needs this'],
      pacing: 'Fun and light',
      visualStyle: 'Animals first, bright, playful',
      narrationTone: 'Warm, fun',
      ctaExamples: ['Tag a pet parent'],
      recommendedLength: '15-30s',
      keyElements: ['Cuteness', 'Practical tips'],
      retentionHooks: ['Irresistible animal moment', 'Surprising pet hack', 'Unexpected animal reaction'],
    },
  },

  animation_3d: {
    name: '3D Animation',
    key: 'animation_3d',
    priority: 6,
    triggerKeywords: ['3d animation', 'pixar style', 'detailed textures', 'cinematic 3d', 'animated', 'animation', 'pixar', 'cartoon', '3d render', 'cgi', 'character animation', 'animated story', 'digital world', 'blender', 'render', 'cinematic render', 'motion design'],
    negativeKeywords: ['low poly', 'bad rigging', 'unfinished animation', 'low poly', 'rigid', 'live action', 'real person', 'documentary'],
    imagePromptPrefix: 'High-quality 3D animated scene. Pixar/Disney quality characters and environments. Detailed textures, cinematic lighting, expressive character faces. Clearly animated stylized art style.',
    videoPromptPrefix: 'Pixar-quality 3D animated scene. Last frame continuity: maintain character model, world geometry, and lighting rig exactly. Motion: expressive character — squash-and-stretch walk cycle, secondary hair and cloth simulation, rich emotional facial expression. Physically accurate cinematic lighting with Deakins-inspired shadows. Camera: smooth tracking following character arc.',
    negativePrompt: 'blur, low poly, rigid movement, bad rigging, flat lighting, low quality, texture errors, clipping, unanimated background, real photo mixed with animation, inconsistent style',
    cinemaStyle: 'Pixar-quality 3D cinematic, detailed textures, physically accurate lighting and shadows, expressive character animation, vibrant saturated palette',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Setup → Conflict → Resolution',
    environmentInclude: 'Richly detailed animated world, expressive character close-ups, animated environmental effects — wind, rain, light beams, particle effects, animated foliage',
    environmentExclude: 'Real photography mixed in, low-poly game assets, flat shading, static background, unanimated crowd, broken character rigs',
    voiceoverTemplate: "In a world where [setup], our hero faces [challenge]. Watch how determination changes everything. [Story beat 1]. [Story beat 2]. And in the end? [Resolution]. Because the greatest stories aren't given — they're earned.",
    playbook: {
      hookStyles: ['In a world where...', 'The story they never told', 'Watch what happens next'],
      pacing: 'Cinematic story beats',
      visualStyle: 'Rich 3D world, expressive characters, dramatic lighting',
      narrationTone: 'Epic storytelling, emotional, cinematic',
      ctaExamples: ['Who should the next story be about?', 'Share with a dreamer'],
      recommendedLength: '45-90s',
      keyElements: ['Character arc', 'World-building', 'Emotional climax'],
      retentionHooks: ['Stunning world reveal', 'Character transformation moment', 'Unexpected plot twist'],
    },
  },

  // ── Lifestyle fallback (not shown in dropdown — used when nothing matches) ───
  lifestyle: {
    name: 'Lifestyle · Daily Life',
    key: 'lifestyle',
    priority: 1,
    triggerKeywords: ['lifestyle', 'daily life', 'vlog', 'day in my life', 'routine', 'morning', 'evening', 'get ready', 'haul', 'apartment', 'room tour', 'aesthetic'],
    negativeKeywords: ['war', 'battle', 'medieval', 'historical', 'surgery', 'medical'],
    imagePromptPrefix: 'Authentic everyday moments. Real environments — home, cafe, street, park. Natural and relatable person in natural setting.',
    videoPromptPrefix: 'Authentic lifestyle moment. Continue from last frame: preserve character, everyday setting, and warm natural light. Motion Brush: natural casual movement — walking through home, preparing coffee, looking out window. Roger Deakins soft warm natural indoor light. Camera: intimate handheld feel, gentle push-in on real human moment.',
    negativePrompt: 'war, battle, blood, medieval, corporate boardroom, laboratory, hospital, fantasy, CGI, unrealistic',
    cinemaStyle: 'Soft natural lighting, warm tones, shallow depth of field, intimate handheld feel',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Moment → Connection → Feeling',
    environmentInclude: 'Real home interior, coffee shop window seat, park bench, apartment balcony, cozy bedroom corner, farmers market stall, neighbourhood street',
    environmentExclude: 'Corporate office, laboratory, operating room, battlefield, factory floor, courtroom, fantasy realm',
    voiceoverTemplate: "This is my [morning/evening] routine and it changed everything. First: [habit 1]. Then: [habit 2]. And this one — [habit 3] — I've been doing every single day. It's the small things that add up.",
    playbook: {
      hookStyles: ['Day in my life', 'You need to try this'],
      pacing: 'Relaxed but engaging',
      visualStyle: 'Warm, authentic, everyday beauty',
      narrationTone: 'Conversational, relatable',
      ctaExamples: ['What should I try next?'],
      recommendedLength: '15-45s',
      keyElements: ['Authenticity', 'Daily moments'],
      retentionHooks: ['Unexpected daily moment', 'Relatable struggle', 'Satisfying routine reveal'],
    },
  },

};

// ── Legacy aliases — maps old hyphenated/short keys to new underscore keys ────
// Enables backward compatibility when old keys arrive from cached clients or DB.
const KEY_ALIASES: Record<string, string> = {
  // old key           → new key
  'motivation':          'motivation_success',
  'personal-finance':    'finance_investing',
  'side-hustles':        'side_hustles',
  'health-fitness':      'health_fitness',
  'beauty-skincare':     'beauty_skincare',
  'food-recipes':        'food_recipes',
  'product-reviews':     'product_reviews',
  'faceless-stoic':      'faceless_stoic',
  'luxury':              'luxury_lifestyle',
  'technology-ai':       'tech_ai',
  'relationships':       'relationships_dating',
  'mental-health':       'mental_health',
  '3d-animation':        'animation_3d',
  // also handle personal-finance-side-hustles (was a bug, now aliases to finance)
  'personal-finance-side-hustles': 'finance_investing',
  // short forms
  'fitness':             'health_fitness',
  'pet-care':            'pets',
  'animation-3d':        'animation_3d',
  // concept words sent by older code or external pipelines
  'psychology':          'mental_health',
  'wellness':            'mental_health',
  'meditation':          'mental_health',
  'wellbeing':           'mental_health',
  'kindness':            'relationships_dating',
  'compassion':          'relationships_dating',
  'stoic':               'faceless_stoic',
  'stoicism':            'faceless_stoic',
  'finance':             'finance_investing',
  'investing':           'finance_investing',
  'technology':          'tech_ai',
  'artificial intelligence': 'tech_ai',
  'cooking':             'food_recipes',
  'recipe':              'food_recipes',
  'beauty':              'beauty_skincare',
  'skincare':            'beauty_skincare',
  'gaming':              'gaming',
  'animation':           'animation_3d',
  // tool IDs from /tools page — map to richest matching AI settings
  'friendships':         'relationships_dating',
  'spirituality':        'mental_health',
  'self-improvement':    'motivation_success',
  'fashion':             'beauty_skincare',
  'business':            'finance_investing',
  'travel':              'luxury_lifestyle',
  'parenting':           'relationships_dating',
};

// ── Legacy alias export ───────────────────────────────────────────────────────
export const NICHE_HIDDEN_SETTINGS = NICHE_SETTINGS;

// ── Era detection ─────────────────────────────────────────────────────────────

export function detectEra(text: string): string | null {
  const yearMatch = text.match(/\b(1[89]\d{2}|20[01]\d)\b/);
  if (yearMatch) return yearMatch[1];

  const eraMap: Array<[RegExp, string]> = [
    [/\bd-day\b|world war (?:two|ii|2)\b/i,     "World War II, 1944"],
    [/\bworld war (?:one|i|1)\b/i,              "World War I, 1917"],
    [/\bvictorian\b/i,                          "Victorian era, 1880s"],
    [/\bmediev(?:al|eval)\b/i,                  "Medieval era"],
    [/\b(?:roaring\s+)?twenties\b/i,            "1920s"],
    [/\bcold war\b/i,                           "Cold War era, 1960s"],
    [/\bgreat depression\b/i,                   "Great Depression, 1930s"],
    [/\b(?:wild\s+)?west\b/i,                   "American Old West, 1880s"],
    [/\bvietnam war\b/i,                        "Vietnam War, 1968"],
    [/\bkorean war\b/i,                         "Korean War, 1950s"],
  ];

  for (const [re, label] of eraMap) {
    if (re.test(text)) return label;
  }

  return null;
}

// ── Niche classifier — 4-step priority-aware routing ────────────────────────
//
// Step 1  Score every niche (+2 per trigger keyword match)
// Step 2  Negative filter (any match → score = -999, niche is excluded)
// Step 3  Tie-break by priority (higher priority wins within TIE_THRESHOLD)
// Step 4  Output top category only (classifyNiche() for multi-tag output)

const TIE_THRESHOLD = 4; // scores within this many points are considered a tie

function scoreNiche(settings: NicheSettings, raw: string): number {
  // Negative keyword check — any match collapses score to -999 (excluded)
  for (const neg of settings.negativeKeywords) {
    if (raw.includes(neg.toLowerCase())) return -999;
  }
  let score = 0;
  for (const kw of settings.triggerKeywords) {
    if (raw.includes(kw.toLowerCase())) score += 2;
  }
  return score;
}

export function getNicheSettings(input: string | null | undefined): NicheSettings {
  if (!input?.trim()) {
    console.log(`[NICHE_RESOLVED] no input — resolved="lifestyle" (default)`);
    return NICHE_SETTINGS['lifestyle'];
  }

  const raw = (input || '').toLowerCase().trim();

  // Step 1: Exact key match (UI always sends a valid key — fast path)
  if (NICHE_SETTINGS[raw]) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${raw}" (exact)`);
    return NICHE_SETTINGS[raw];
  }

  // Step 2: Legacy alias map (backward compat — old hyphenated or short keys)
  const aliased = KEY_ALIASES[raw];
  if (aliased && NICHE_SETTINGS[aliased]) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${aliased}" (alias)`);
    return NICHE_SETTINGS[aliased];
  }

  // Step 3: Normalize hyphens → underscores and re-try exact match
  const normalized = raw.replace(/-/g, '_');
  if (NICHE_SETTINGS[normalized]) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${normalized}" (normalized)`);
    return NICHE_SETTINGS[normalized];
  }

  // Step 4: Score-based match with priority tie-breaking
  const scored = Object.values(NICHE_SETTINGS)
    .map(s => ({ settings: s, score: scoreNiche(s, raw) }))
    .filter(x => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.settings.priority - a.settings.priority;
    });

  if (scored.length > 0) {
    const topScore = scored[0].score;
    const tied = scored.filter(x => topScore - x.score <= TIE_THRESHOLD);
    const winner = tied.reduce((best, x) =>
      x.settings.priority > best.settings.priority ? x : best
    , tied[0]);

    console.log(
      `[NICHE_RESOLVED] input="${input}" resolved="${winner.settings.key}" ` +
      `score=${winner.score} priority=${winner.settings.priority}` +
      (tied.length > 1 ? ` (beat ${tied.length - 1} tied)` : '')
    );
    return winner.settings;
  }

  // Step 5: Partial key match (input contains a known key substring)
  const partialKey = Object.keys(NICHE_SETTINGS).find(k => raw.includes(k));
  if (partialKey) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${partialKey}" (partial)`);
    return NICHE_SETTINGS[partialKey];
  }

  // Step 6: Default fallback
  console.log(`[NICHE_RESOLVED] input="${input}" resolved="lifestyle" (default fallback)`);
  return NICHE_SETTINGS['lifestyle'];
}

// ── Multi-tag classifier ──────────────────────────────────────────────────────
//
// Returns primary category + secondary matches for AI routing context.
// Use when you need semantic context beyond a single niche.
//
// Example: { primary: 'mental_health', secondary: ['motivation_success', 'relationships_dating'] }

export interface NicheClassification {
  primary:   string;
  secondary: string[];
  scores:    Record<string, number>;
}

export function classifyNiche(input: string): NicheClassification {
  const raw = (input || '').toLowerCase().trim();

  const scored = Object.values(NICHE_SETTINGS)
    .filter(s => s.key !== 'lifestyle')
    .map(s => ({ key: s.key, score: scoreNiche(s, raw), priority: s.priority }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score !== a.score ? b.score - a.score : b.priority - a.priority);

  if (scored.length === 0) {
    return { primary: 'lifestyle', secondary: [], scores: {} };
  }

  const topScore = scored[0].score;
  const topGroup = scored.filter(x => topScore - x.score <= TIE_THRESHOLD);
  const primary  = topGroup.reduce((best, x) => x.priority > best.priority ? x : best, topGroup[0]);

  const secondary = scored
    .filter(x => x.key !== primary.key && x.score > 0)
    .slice(0, 3)
    .map(x => x.key);

  const scores = Object.fromEntries(scored.map(x => [x.key, x.score]));
  console.log(`[NICHE_CLASSIFY] primary="${primary.key}" secondary=[${secondary.join(',')}]`);
  return { primary: primary.key, secondary, scores };
}

// ── Convenience: get all public niches for dropdown ──────────────────────────

export function getPublicNiches(): Array<{ key: string; name: string }> {
  return Object.values(NICHE_SETTINGS)
    .filter(n => n.key !== 'lifestyle')
    .map(n => ({ key: n.key, name: n.name }));
}

// ── CATEGORIES — single source of truth (Upgrade 3) ──────────────────────────
//
// Import this in any file that needs to reference the 15 valid display labels.
// Frontend and backend both use this — no drift possible.
// The KEY_TO_LABEL map in /api/v1/classify/route.ts is derived from this.

export const CATEGORIES = [
  'Motivation / Success',
  'Personal Finance & Investing',
  'Side Hustles & Money Making',
  'Health & Fitness',
  'Beauty / Skincare / Makeup',
  'Food & Recipes',
  'Product Reviews & Launches',
  'Faceless Motivation / Stoic Content',
  'Luxury Lifestyle',
  'Technology & AI',
  'Relationships & Dating',
  'Mental Health & Wellness',
  'Gaming',
  'Pets',
  '3D Animation',
] as const;

export type Category = typeof CATEGORIES[number];
