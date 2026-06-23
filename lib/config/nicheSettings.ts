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

  fitness: {
    name: 'Fitness',
    key: 'fitness',
    triggerKeywords: ['fitness', 'workout', 'gym', 'exercise', 'lift', 'squat', 'deadlift', 'bench press', 'cardio', 'hiit', 'crossfit', 'gains', 'muscle', 'reps', 'sets', 'training'],
    negativeKeywords: ['meditation', 'spa', 'massage', 'cooking', 'recipe'],
    imagePromptPrefix: 'Gym or outdoor training environment. Athletic person mid-exercise. Visible effort, form, and determination.',
    videoPromptPrefix: 'Powerful athletic movement. Lifting, running, jumping, pulling. Explosive physical action.',
    negativePrompt: 'sedentary, sitting, desk, office, cooking, sleeping, relaxing, spa, meditation cushion, pajamas',
    cinemaStyle: 'High contrast, dramatic gym lighting, dynamic angles, slow-motion on effort moments',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Challenge → Effort → Achievement',
    environmentInclude: 'Gym floor with squat rack and plates, rubber mat, dumbbells, pull-up bar, running track, outdoor park workout area, jump rope, kettlebells, gym mirror',
    environmentExclude: 'Couch, bed, dining table, office desk, cooking kitchen, beauty vanity, meditation cushion, spa',
    voiceoverTemplate: "Stop skipping the gym. Here's the 3-move workout that changed everything for me. [Move 1] for [reps]. [Move 2] for [reps]. [Move 3] for [reps]. No equipment needed. Do this every morning and watch what happens in 30 days.",
    playbook: {
      hookStyles: ['Day 1 vs Day 30', 'This changed my body', 'Try this workout'],
      pacing: 'Fast cuts, high energy, 1-2 second shots',
      visualStyle: 'Sweat, gym lighting, dynamic angles, slow-mo on lifts',
      narrationTone: 'Motivational, energetic, direct',
      ctaExamples: ['Save this workout', 'Tag your gym buddy', 'Comment your favorite'],
      recommendedLength: '15-30s',
      keyElements: ['Transformation', 'Determination', 'Before/After'],
      retentionHooks: ['Before/After reveal', 'Countdown timer', 'Personal record moment'],
    },
  },

  'personal-finance-side-hustles': {
    name: 'Personal Finance & Side Hustles',
    key: 'personal-finance-side-hustles',
    triggerKeywords: ['personal finance', 'budget', 'saving money', 'debt free', 'financial freedom', 'side hustle', 'side income', 'extra money', 'freelance', 'passive income', 'make money online', 'dropshipping', 'reselling'],
    negativeKeywords: ['gambling', 'betting', 'get rich quick', 'scam', 'pyramid'],
    imagePromptPrefix: 'Clean professional financial setting. Laptop with income dashboard, home office, cash, charts. Real person building income from home.',
    videoPromptPrefix: 'Energetic multitasking movement. Typing, reviewing earnings, packing orders, phone with banking app. Real work visible.',
    negativePrompt: 'luxury mansion, yacht, lamborghini, casino, private jet, unrealistic wealth, pyramid scheme',
    cinemaStyle: 'Warm and trustworthy, natural indoor lighting, clean compositions, authentic hustle feel',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Plan → Progress',
    environmentInclude: 'Home desk with laptop showing earnings, shipping supplies and label printer, phone with banking app, notebook with budget, piggy bank, grocery receipt, organised filing',
    environmentExclude: 'Luxury car, private jet, mansion, penthouse, casino chips, passive beach lounging, pyramid scheme whiteboard',
    voiceoverTemplate: "I made an extra $[amount] this month with zero experience. Here's exactly how: [Step 1]. [Step 2]. [Step 3]. You don't need followers, investment, or special skills. This is the side hustle nobody's talking about yet.",
    playbook: {
      hookStyles: ['I made $X with $0', 'The side hustle no one talks about', 'Avoid this mistake'],
      pacing: 'Clear step-by-step with text overlays',
      visualStyle: 'Clean, professional, screen recordings + real life',
      narrationTone: 'Trustworthy, practical, excited',
      ctaExamples: ['Link in bio', "Comment 'YES' for guide", 'Try this this week'],
      recommendedLength: '20-45s',
      keyElements: ['Numbers', 'Proof', 'Actionable steps'],
      retentionHooks: ['Revenue screenshot reveal', 'Dollar amount in hook', 'Step-by-step numbered list'],
    },
  },

  motivation: {
    name: 'Motivation',
    key: 'motivation',
    triggerKeywords: ['motivation', 'motivational', 'inspiration', 'never give up', 'discipline', 'grind', 'hustle', 'push through', 'no excuses', 'rise up', 'keep going', 'beast mode', 'mindset', 'winner'],
    negativeKeywords: ['depression', 'giving up', 'quitting', 'lazy'],
    imagePromptPrefix: 'Aspirational and powerful. Person demonstrating effort, focus, determination through physical action. Golden hour or dramatic contrast lighting.',
    videoPromptPrefix: 'Energetic purposeful movement. Forward momentum. Visible physical effort and determination.',
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

  luxury: {
    name: 'Luxury · High-End Living',
    key: 'luxury',
    triggerKeywords: ['luxury', 'designer', 'high end', 'premium', 'exclusive', 'penthouse', 'rolex', 'gucci', 'louis vuitton', 'ferrari', 'lamborghini', 'yacht', 'private jet', 'first class', 'fine dining', 'champagne'],
    negativeKeywords: ['budget', 'cheap', 'thrift', 'frugal', 'broken', 'damaged', 'poverty'],
    imagePromptPrefix: 'Pristine luxury environment. Immaculate interiors, polished surfaces, premium materials — marble, leather, crystal, gold accents. Everything clean, new, aspirational.',
    videoPromptPrefix: 'Elegant refined movement. Slow deliberate gestures. Person interacting with luxury items gracefully.',
    negativePrompt: 'cheap, broken, damaged, burnt, rusted, abandoned, junkyard, trash, messy, dirty, cluttered, poverty, budget, discount, thrift store, fast food, crumbling',
    cinemaStyle: 'Rich warm tones, golden lighting, shallow depth of field, slow elegant camera movement, magazine-quality composition',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Aspiration → Experience → Indulgence',
    environmentInclude: 'Marble floor, crystal chandelier, leather seating, gold accents, polished surfaces, penthouse view, designer boutique interior, champagne glass, fresh flowers in crystal vase, silk fabric, walnut wood',
    environmentExclude: 'Broken items, rust, peeling paint, graffiti, trash, dirt, budget store, plastic furniture, worn carpet, fast food, junkyard, abandoned building',
    voiceoverTemplate: "This is what $[price] per night looks like in [location]. From the moment you walk in — [detail 1]. The view: [detail 2]. And the [highlight]? Absolutely unreal. If you know, you know. And if you don't — now you do.",
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

  'technology-ai': {
    name: 'Technology & AI Innovations',
    key: 'technology-ai',
    triggerKeywords: ['technology', 'tech', 'ai', 'artificial intelligence', 'robot', 'gadget', 'app', 'software', 'coding', 'programming', 'machine learning', 'automation', 'drone', 'smart home'],
    negativeKeywords: ['medieval', 'ancient', 'historical', 'cooking', 'recipe', 'beauty'],
    imagePromptPrefix: 'Modern tech environment. Clean desk with multiple monitors, code on screen, devices, modern workspace. Person interacting with technology.',
    videoPromptPrefix: 'Precise focused movement. Typing, swiping, demonstrating technology. Interaction with screens and devices.',
    negativePrompt: 'medieval, ancient, rustic, farmhouse, candle, handwritten, vintage, old-fashioned, no technology, countryside',
    cinemaStyle: 'Cool blue tones, clean modern lighting, sharp focus, minimal composition, slightly futuristic',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Innovation → Future',
    environmentInclude: 'Multiple monitors with code or UI, mechanical keyboard, clean desk with devices, server rack lights, drone on desk, smart home devices, VR headset, circuit board close-up',
    environmentExclude: 'Rustic cabin, farmhouse, candlelit room, handwritten notes only, medieval setting, no-technology environment, old-fashioned typewriter',
    voiceoverTemplate: "This new AI tool just made [task] 10x faster. Here's how it works: [Step 1]. [Step 2]. And this part blew my mind — [unexpected feature]. I've been using it for [timeframe] and I'm never going back. Link in bio.",
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

  'mental-health': {
    name: 'Mental Health & Mindfulness',
    key: 'mental-health',
    triggerKeywords: ['mental health', 'anxiety', 'depression', 'therapy', 'mindfulness', 'self care', 'boundaries', 'healing', 'trauma', 'burnout', 'overwhelm', 'coping', 'breathing exercise', 'journaling', 'inner peace'],
    negativeKeywords: ['party', 'rave', 'extreme sport', 'horror', 'violence'],
    imagePromptPrefix: 'Calm safe environment. Soft lighting, comfortable space, journal and pen, nature, warm blanket, tea. Person in peaceful introspective moment.',
    videoPromptPrefix: 'Gentle inward movement. Deep breathing, journaling, sitting quietly, walking slowly in nature. Calm and present.',
    negativePrompt: 'loud, aggressive, party, horror, violence, screaming, chaos, rave, extreme sports, dangerous activity',
    cinemaStyle: 'Soft muted tones, gentle warm lighting, very slow camera movement, intimate and safe, quiet pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Struggle → Awareness → Peace',
    environmentInclude: 'Cozy corner with blanket and journal, window seat with rain outside, nature path alone, therapy office with comfortable chair, warm cup of tea in hands, sunrise view from bed, calm water reflection',
    environmentExclude: 'Loud party, extreme sports, horror imagery, violent scene, chaotic crowd, aggressive confrontation, dark frightening space',
    voiceoverTemplate: "If you've been feeling [emotion] lately, I need you to hear this. You're not broken. You're not weak. You're human. Here's the one thing that helped me get through [struggle]: [insight]. Give yourself permission to [action]. You deserve to feel better.",
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

  relationships: {
    name: 'Relationships & Love',
    key: 'relationships',
    triggerKeywords: ['relationship', 'love', 'couple', 'marriage', 'partner', 'romance', 'anniversary', 'proposal', 'together', 'long distance', 'soulmate', 'boyfriend', 'girlfriend', 'husband', 'wife', 'dating', 'red flags', 'green flags'],
    negativeKeywords: ['divorce lawyer', 'custody battle', 'revenge', 'cheating exposed'],
    imagePromptPrefix: 'Intimate warm setting. Two people sharing a genuine moment. Home, park, restaurant, beach. Authentic connection visible in body language.',
    videoPromptPrefix: 'Intimate connected movement. Hands touching, walking together, leaning in, shared glances. Gentle proximity.',
    negativePrompt: 'arguing, fighting, screaming, violence, courtroom, lawyer, angry, revenge, breakup screaming',
    cinemaStyle: 'Warm golden tones, soft focus, intimate close-ups, gentle camera drift, romantic atmosphere',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Connection → Tension → Resolution',
    environmentInclude: 'Park bench for two, dinner table with candles, kitchen cooking together, couch with blanket, walking path, beach shoreline, car interior conversation, doorstep moment',
    environmentExclude: 'Courtroom, lawyer office, single person angry, broken glass, slamming door, violent scene, dark lonely room',
    voiceoverTemplate: "If your partner does [green flag], keep them. Here are 5 signs you've found the right one. [Sign 1]. [Sign 2]. [Sign 3]. [Sign 4]. And the biggest one? [Sign 5]. Real love isn't perfect — it's consistent. Tag someone who needs to hear this.",
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

  history: {
    name: 'History · True Stories · Documentary',
    key: 'history',
    triggerKeywords: ['history', 'historical', 'ancient', 'roman empire', 'ww2', 'wwii', 'world war', 'civil war', 'medieval', 'victorian', 'renaissance', 'colonial', 'revolution', '1800s', '1900s', '1940s', 'pharaoh', 'gladiator', 'samurai', 'viking', 'crusade', 'empire', 'dynasty', 'battle of', 'siege', 'd-day', 'soldier', 'true story', 'documentary', 'real life', 'actually happened'],
    negativeKeywords: ['fantasy', 'game', 'fiction', 'cosplay', 'anime', 'superhero', 'sci-fi'],
    imagePromptPrefix: 'Historically accurate period setting. Era-accurate clothing, weapons, architecture, and props. WWII/1940s military: olive drab wool US Army uniform, metal military cot, wool blanket, canvas walls, dim hanging bare incandescent bulb, wooden floor, dog tags, leather boots, military gear in background. Photorealistic cinematic, film grain, moody volumetric lighting. No modern objects, no contemporary clothing, no synthetic materials.',
    videoPromptPrefix: 'Historically authentic. Young adult male approximately 19-22 years old, fair skin, short hair, tired but alert expression. WWII military: olive drab wool shirt, dog tags, leather boots, metal cot with wool blanket. Dim hanging bare incandescent bulb or candlelight only. Natural subtle motion — breathing, slight weight shift, hands on knees. No modern objects, no contemporary decor, no bright lighting.',
    negativePrompt: 'modern, contemporary, fluorescent light, cyan light, blue LED, teal glow, neon, futuristic lighting, cool-toned light, plastic, synthetic, digital screen, smartphone, modern furniture, sneakers, t-shirt, jeans, hoodie, modern lamp, potted plants, contemporary decor, cosplay, halloween costume, bright studio lighting, static mannequin pose, chrome, stainless steel, modern helmet, tactical gear, body armor, kevlar, night vision, laser sight, post-2000 equipment',
    cinemaStyle: 'Cinematic film grain, desaturated period-accurate colour palette (olive drab, khaki, shadow grey), natural candlelight or single bare-bulb incandescent, slow deliberate camera movement, moody volumetric light shafts',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: true,
    emotionalArc: 'Context → Tension → Revelation',
    environmentInclude: 'Steel-frame bunk beds, thin mattresses, rough wool blankets, bare concrete or wooden plank floor, bare incandescent bulb hanging from wire or oil lamp, canvas kit bags, steel helmets, canteens, wooden footlockers, rough wooden support posts, small high windows with no curtains, institutional military setting',
    environmentExclude: 'Standing floor lamps, lampshades, curtains, drapes, upholstered furniture, armchairs, sofas, side tables, carpet, rugs, picture frames, home furniture, modern light fixtures, hotel room, living room, decorative items',
    voiceoverTemplate: "In [year], [person or group] faced an impossible choice. [Setup the stakes]. What happened next changed history forever. [Key event 1]. [Key event 2]. And the outcome? [Revelation]. Most people have never heard this story. Until now.",
    playbook: {
      hookStyles: ['The forgotten story of...', 'What really happened'],
      pacing: 'Cinematic and measured',
      visualStyle: 'Dramatic lighting, authentic props',
      narrationTone: 'Storytelling, serious',
      ctaExamples: ['What do you think happened next?'],
      recommendedLength: '30-60s',
      keyElements: ['Authenticity', 'Dramatic visuals'],
      retentionHooks: ['Shocking historical fact opener', 'Unknown story hook', 'Dramatic pause before reveal'],
    },
  },

  'beauty-skincare': {
    name: 'Beauty · Skincare · Makeup',
    key: 'beauty-skincare',
    triggerKeywords: ['beauty', 'skincare', 'makeup', 'foundation', 'lipstick', 'serum', 'moisturizer', 'glow', 'routine', 'concealer', 'contour', 'eyeshadow', 'blush', 'cleanser', 'toner', 'spf', 'sunscreen'],
    negativeKeywords: ['mechanic', 'engine', 'welding', 'construction', 'war', 'battle'],
    imagePromptPrefix: 'Clean beauty environment. Vanity mirror, bright even lighting, products arranged neatly, skin close-ups. Person applying or showcasing product.',
    videoPromptPrefix: 'Precise beauty movement. Applying product, blending, tapping skin, swatching. Smooth controlled hand motions.',
    negativePrompt: 'dirty, greasy, mechanic, engine, war, blood, sweat, mud, construction site, welding, gym sweat',
    cinemaStyle: 'Bright clean, ring-light quality, warm skin tones, extreme close-ups on skin and product',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Before → Process → Glow',
    environmentInclude: 'Vanity mirror with ring light, bathroom counter with products arranged, cotton pads and serums, face close-up with dewy skin, makeup palette open, brush set, clean white towel, skincare fridge',
    environmentExclude: 'Garage, engine grease, construction site, muddy field, sweaty gym, dark industrial space, welding sparks',
    voiceoverTemplate: "I tried [product/routine] for 30 days. Here's what actually happened to my skin. Week 1: [observation]. Week 2: [change]. By week 4: [result]. The one product I'll never stop using? [Product]. Your skin will thank you.",
    playbook: {
      hookStyles: ['This changed my skin', '5-minute glow up'],
      pacing: 'Fast transformation',
      visualStyle: 'Close-ups, clean, bright lighting',
      narrationTone: 'Friendly, tutorial',
      ctaExamples: ['Try this routine'],
      recommendedLength: '15-30s',
      keyElements: ['Before/After', 'Close-ups'],
      retentionHooks: ['Skin transformation reveal', 'Product ingredient surprise', 'Satisfying application ASMR'],
    },
  },

  productivity: {
    name: 'Productivity & Time Management',
    key: 'productivity',
    triggerKeywords: ['productivity', 'time management', 'focus', 'deep work', 'planner', 'to-do', 'pomodoro', 'efficiency', 'morning routine productive', 'workflow', 'organize', 'schedule', 'calendar', 'notion'],
    negativeKeywords: ['procrastination glorified', 'lazy', 'binge watching'],
    imagePromptPrefix: 'Organised productive workspace. Clean desk, planner open, laptop with focus app, timer visible, organised shelves. Person working with clear intention.',
    videoPromptPrefix: 'Focused efficient movement. Writing in planner, checking off tasks, organising desk, typing purposefully.',
    negativePrompt: 'messy room, sleeping in, binge watching, scrolling social media, procrastinating, cluttered chaos',
    cinemaStyle: 'Clean minimal, bright natural lighting, organised compositions, satisfying order, calm focused pacing',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Chaos → System → Control',
    environmentInclude: 'Clean desk with planner open, monitor with to-do app, timer visible, organised shelf with labelled boxes, morning coffee next to laptop, bullet journal with pen, standing desk, minimalist workspace',
    environmentExclude: 'Messy room with clothes everywhere, TV on with streaming, phone showing social media scroll, unmade bed at 2pm, junk food wrappers, overflowing trash',
    voiceoverTemplate: "I stopped multitasking and got 3x more done. Here's the system: [Rule 1]. [Rule 2]. [Rule 3]. The tool that made it all click: [tool]. Your mornings will never be the same. Save this before you forget it.",
    playbook: {
      hookStyles: ['Do this instead of scrolling', 'Productivity hack'],
      pacing: 'Clear and actionable',
      visualStyle: 'Aesthetic desk, timers, clean UI',
      narrationTone: 'Practical, motivating',
      ctaExamples: ['Which tip will you try?'],
      recommendedLength: '20-40s',
      keyElements: ['Systems', 'Visual routines'],
      retentionHooks: ['Satisfying desk setup reveal', 'Time saved metric', 'Unexpected simple hack'],
    },
  },

  'business-entrepreneurship': {
    name: 'Business · Entrepreneurship',
    key: 'business-entrepreneurship',
    triggerKeywords: ['business', 'entrepreneur', 'startup', 'success story', 'hustle', 'ceo', 'founder', 'company', 'revenue', 'profit', 'scale', 'growth', 'leadership', 'deal', 'pitch', 'investor', 'venture'],
    negativeKeywords: ['gaming', 'cosplay', 'anime', 'cooking', 'recipe'],
    imagePromptPrefix: 'Professional, modern, clean environment. Boardrooms, offices, workspaces, skyline views. Sharp and confident subjects.',
    videoPromptPrefix: 'Confident deliberate movement. Professional body language. Purpose in every gesture.',
    negativePrompt: 'messy, cluttered, casual, pajamas, bedroom, cartoon, fantasy, medieval, beach lounging, gaming setup',
    cinemaStyle: 'Sharp modern, professional lighting, cool-toned or neutral, fast-paced confident cuts',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Strategy → Victory',
    environmentInclude: 'Glass-walled office, conference table, whiteboard with notes, laptop open, skyline through window, co-working space, presentation screen, standing desk, modern workspace',
    environmentExclude: 'Bedroom, kitchen, messy apartment, gaming setup, gym, playground, beach lounge, medieval castle, fantasy setting',
    voiceoverTemplate: "I started with [starting point] and built it to [milestone]. Here's what nobody tells you about entrepreneurship. Lesson 1: [hard truth]. Lesson 2: [counterintuitive insight]. Lesson 3: [key unlock]. The business school won't teach you this. But the market will.",
    playbook: {
      hookStyles: ['How I built $X business', 'Lessons from failure'],
      pacing: 'Story + lessons',
      visualStyle: 'Modern office, graphs, confident founder',
      narrationTone: 'Confident, strategic',
      ctaExamples: ['Follow for more'],
      recommendedLength: '30-60s',
      keyElements: ['Stories', 'Lessons'],
      retentionHooks: ['Revenue milestone reveal', 'Failure story setup', 'Contrarian business insight'],
    },
  },

  'pet-care': {
    name: 'Pet Care & Animals',
    key: 'pet-care',
    triggerKeywords: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'animal', 'vet', 'rescue', 'adoption', 'breed', 'training', 'leash', 'collar', 'treat', 'pet food', 'aquarium', 'bird', 'hamster'],
    negativeKeywords: ['hunting', 'slaughter', 'animal testing', 'fight', 'abuse'],
    imagePromptPrefix: 'Pet-friendly environment. Home, park, vet clinic, garden. Animal as primary subject — adorable, healthy, active. Human-animal bond visible.',
    videoPromptPrefix: 'Playful animal movement. Pet running, playing, cuddling, eating, doing tricks. Natural animal behaviour.',
    negativePrompt: 'hunting, animal harm, cramped cages, abuse, neglect, slaughter, taxidermy, animal fighting',
    cinemaStyle: 'Warm heartfelt, natural lighting, focus on animal eyes and expressions, gentle camera following movement',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Meet → Bond → Joy',
    environmentInclude: 'Living room floor with pet toys, park grass with dog running, cat tree near window, pet bed with sleeping animal, vet exam table (friendly), food bowl being filled, garden with pet exploring, leash and collar close-up',
    environmentExclude: 'Animal testing lab, hunting scene, cramped cage, slaughterhouse, taxidermy, animal fight ring, neglected dirty kennel',
    voiceoverTemplate: "Every [pet owner] needs to know this. [Tip 1] — I wish someone told me sooner. [Tip 2] — vets rarely mention this one. And [Tip 3]? Game changer for [behavior problem]. Your [pet] will be so much happier. Trust me.",
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

  teens: {
    name: 'Teens & Teen Life',
    key: 'teens',
    triggerKeywords: ['teen', 'teenager', 'high school', 'school life', 'adolescent', 'growing up', 'prom', 'first day of school', 'teenage', 'gen z', 'gen alpha'],
    negativeKeywords: ['adult content', 'alcohol', 'drugs', 'violence', 'weapon', 'gambling'],
    imagePromptPrefix: 'Age-appropriate teen-friendly environment. School, bedroom, park, mall, sports field. Bright, safe, relatable teen setting.',
    videoPromptPrefix: 'Natural youthful movement. Laughing, walking with friends, studying, playing sports. Energetic and innocent.',
    negativePrompt: 'adult content, alcohol, drugs, smoking, violence, weapons, gambling, nightclub, bar, provocative, suggestive, mature',
    cinemaStyle: 'Bright vibrant, pop colours, energetic camera, natural daylight, youthful optimistic feel',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Moment → Emotion → Growth',
    environmentInclude: 'School hallway with lockers, bedroom with fairy lights and posters, park with friends, school cafeteria, sports field sideline, library study table, phone screen showing group chat',
    environmentExclude: 'Bar, nightclub, alcohol bottles, cigarettes, weapons, adult workplace, casino, dark alley, anything sexually suggestive',
    voiceoverTemplate: "POV: [relatable teen scenario]. We've all been there. [Situation 1]. [Situation 2]. And don't even get me started on [funny situation]. Being a teen is wild but honestly? [Positive spin]. Tag your bestie who gets it.",
    playbook: {
      hookStyles: ['Relatable teen struggles', 'POV: School'],
      pacing: 'Very fast',
      visualStyle: 'Trendy, Gen-Z aesthetic',
      narrationTone: 'Casual, Gen-Z slang',
      ctaExamples: ['Tag your bestie'],
      recommendedLength: '15-30s',
      keyElements: ['Humor', 'Relatability'],
      retentionHooks: ['Instantly relatable POV', 'Unexpected school moment', 'Gen-Z cultural reference'],
    },
  },

  'food-recipes': {
    name: 'Food · Recipes · Cooking',
    key: 'food-recipes',
    triggerKeywords: ['food', 'recipe', 'cooking', 'baking', 'meal prep', 'chef', 'kitchen', 'ingredient', 'dish', 'dessert', 'pasta', 'steak', 'salad', 'soup', 'breakfast', 'lunch', 'dinner'],
    negativeKeywords: ['diet pill', 'fasting extreme', 'war', 'gaming', 'technology'],
    imagePromptPrefix: 'Kitchen or dining environment. Ingredients on counter, cooking in progress, finished plated dish. Warm steam, fresh textures, vibrant food colours.',
    videoPromptPrefix: 'Active cooking movement. Chopping, stirring, plating, pouring, seasoning. Hands in constant purposeful motion.',
    negativePrompt: 'laboratory, medical, gaming setup, office desk, gym, car, battle, weapon, dirty environment',
    cinemaStyle: 'Warm appetising tones, overhead and close-up angles, steam and texture visible, cozy kitchen lighting',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Prep → Cook → Serve',
    environmentInclude: 'Kitchen counter with ingredients prepped, cutting board with knife and vegetables, stovetop with pan and steam, oven with golden bake visible, plated dish on table, herbs and spices jars, mixing bowl mid-action',
    environmentExclude: 'Laboratory, medical equipment, gym weights, gaming monitor, car engine, office printer, construction tools',
    voiceoverTemplate: "This [dish] takes 10 minutes and tastes like you ordered it from a restaurant. Here's how: [Step 1]. [Step 2]. Secret ingredient: [ingredient]. Final step: [step]. Plate it, taste it, send it to someone you want to impress. You're welcome.",
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

  diy: {
    name: 'DIY + Money Saving Hacks/Tricks',
    key: 'diy',
    triggerKeywords: ['diy', 'do it yourself', 'build', 'craft', 'handmade', 'woodworking', 'renovation', 'repair', 'project', 'tools', 'workshop', 'paint', 'restore', 'fix', 'money saving', 'save money', 'frugal', 'coupon', 'discount', 'budget hack', 'thrifty', 'cheap'],
    negativeKeywords: ['luxury', 'designer', 'expensive', 'premium', 'splurge'],
    imagePromptPrefix: 'Workshop or home project environment. Tools, materials, work-in-progress. Hands actively building, cutting, painting, assembling. Also practical everyday setting showing money-saving hacks.',
    videoPromptPrefix: 'Hands-on building movement. Sawing, hammering, painting, measuring, assembling. Quick demonstrating of hacks.',
    negativePrompt: 'luxury store, shopping mall, unboxing, factory, mass production, corporate, fine dining, designer brands',
    cinemaStyle: 'Warm workshop tones, close-up on hands and materials, satisfying process shots, natural lighting',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Plan → Build → Reveal',
    environmentInclude: 'Workbench with tools organised, sawdust on floor, measuring tape, clamps, paint cans, drill and screws, grocery store showing deals, organised pantry, phone showing discount app',
    environmentExclude: 'Luxury store, shopping mall, unboxing, factory, corporate office, fine dining, designer boutique',
    voiceoverTemplate: "Don't spend $[price] on this. Make it yourself for $[fraction]. Here's what you need: [materials]. Step 1: [step]. Step 2: [step]. Total time: [time]. Total cost: $[amount]. I'm never buying [thing] again and neither should you.",
    playbook: {
      hookStyles: ['Save $X with this hack', '5-minute DIY'],
      pacing: 'Very fast, satisfying transformations',
      visualStyle: 'Close-ups, before/after, hands-on',
      narrationTone: 'Clear, energetic',
      ctaExamples: ['Save this hack', 'Try this weekend'],
      recommendedLength: '15-30s',
      keyElements: ['Hands-on', 'Cost saving proof'],
      retentionHooks: ['Before/after transformation', 'Dollar amount saved', 'Satisfying build reveal'],
    },
  },

  gaming: {
    name: 'Gaming',
    key: 'gaming',
    triggerKeywords: ['gaming', 'gamer', 'game', 'esports', 'fps', 'rpg', 'mmorpg', 'twitch', 'stream', 'rank', 'ranked', 'gameplay', 'loadout', 'meta', 'console', 'pc gaming', 'xbox', 'playstation', 'nintendo', 'fortnite', 'minecraft', 'valorant', 'cod', 'league of legends'],
    negativeKeywords: ['cooking', 'outdoor nature', 'historical war documentary', 'meditation'],
    imagePromptPrefix: 'Dynamic gaming environment. Person at high-end gaming setup — RGB keyboard, multiple monitors showing game, headset on. Intense focused expression.',
    videoPromptPrefix: 'Intense focused gaming movement. Eyes tracking screen, hands on mouse and keyboard, visible controller input, reaction moments, leaning forward.',
    negativePrompt: 'blurry, low graphics, toxic behavior, spoilers, generic office, outdoors without gaming context, low quality, poor lighting, boring setup',
    cinemaStyle: 'Dynamic vibrant RGB lighting, dramatic monitor glow, fast cuts on gameplay highlights, shallow DOF on player reaction',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Challenge → Skill → Victory',
    environmentInclude: 'Gaming desk with RGB lighting, multiple monitors showing gameplay, mechanical keyboard, gaming mouse, headset, gaming chair, controller, streaming setup, capture card',
    environmentExclude: 'Office cubicle, outdoor field, kitchen, cooking setup, meditation space, blank white room',
    voiceoverTemplate: "Here's how to dominate in [game] as a beginner. Step one: [strategy]. Step two: [tip]. Use this loadout and watch your rank climb. Let's get into the gameplay.",
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

  'product-reviews': {
    name: 'Product Reviews & Launches',
    key: 'product-reviews',
    triggerKeywords: ['product review', 'unboxing', 'launch', 'honest review', 'worth it', 'tested', 'review', 'gadget review', 'buying guide', 'pros and cons', 'verdict', 'first look', 'hands on'],
    negativeKeywords: ['fake', 'scam', 'misleading', 'clickbait'],
    imagePromptPrefix: 'Clean product presentation. Product centered on neutral surface, unboxed, well-lit. Person examining or using product. Professional and trustworthy setting.',
    videoPromptPrefix: 'Deliberate product demonstration. Unboxing, inspecting, holding, using, demonstrating features. Hands moving purposefully around the product.',
    negativePrompt: 'fake review, broken product, misleading angle, hidden defect, sponsored bias obvious, cluttered messy background, blurry product, low quality, overly staged',
    cinemaStyle: 'Clean neutral tones, product lighting, crisp close-ups on features, honest unboxing aesthetic',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Curiosity → Discovery → Verdict',
    environmentInclude: 'Clean table or desk with product as hero, white or neutral background, good product lighting, packaging open beside product, hands holding product, close-up on key features',
    environmentExclude: 'Cluttered messy room, broken items, misleading visuals, casino, other distracting products',
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

  'faceless-stoic': {
    name: 'Faceless Motivation / Stoic',
    key: 'faceless-stoic',
    triggerKeywords: ['stoic', 'stoicism', 'faceless', 'marcus aurelius', 'discipline', 'silence', 'solitude', 'control what you can', 'obstacle is the way', 'memento mori', 'no excuses', 'hard work', 'dark motivation', 'sigma', 'monk mode', 'masculinity', 'iron mind'],
    negativeKeywords: ['luxury flexing', 'dancing', 'party', 'comedy', 'gossip'],
    imagePromptPrefix: 'Dramatic faceless or silhouetted figure. Epic landscape — mountain peak, open road at dawn, stormy coastline, dark forest clearing. No identifiable face. Power and solitude.',
    videoPromptPrefix: 'Slow deliberate movement in epic landscape. Silhouette walking forward, standing at edge, hands at sides. No face visible. Environmental motion — wind, rain, mist.',
    negativePrompt: 'luxury flex, dancing, party, comedy sketch, gossip, bright happy colors, celebrity face, smiling selfie, victim mentality, emotional drama, loud hype, chaotic background, low quality',
    cinemaStyle: 'Dark cinematic, desaturated with single warm accent, epic wide shots, slow motion, heavy shadow, atmospheric mist or rain',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Struggle → Clarity → Resolve',
    environmentInclude: 'Mountain peak at sunrise, open empty road stretching ahead, dark forest path with single light source, stormy coastline, abandoned track field at dawn, silhouette against epic sky',
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

  'animation-3d': {
    name: '3D Animation',
    key: 'animation-3d',
    triggerKeywords: ['3d animation', 'animated', 'animation', 'pixar', 'cartoon', '3d render', 'cgi', 'character animation', 'animated story', 'digital world', 'animated character', 'blender', 'render'],
    negativeKeywords: ['live action', 'real person', 'documentary', 'photorealistic human', 'news'],
    imagePromptPrefix: 'High-quality 3D animated scene. Pixar/Disney quality characters and environments. Detailed textures, cinematic lighting, expressive character faces. Clearly animated stylized art style.',
    videoPromptPrefix: 'Fluid 3D character animation. Expressive character movements, squash and stretch, secondary motion on hair and clothing. Rich animated environment.',
    negativePrompt: 'blurry, low poly, rigid stiff movement, bad rigging, flat lighting, texture errors, clipping, unanimated background, real photo mixed with animation, inconsistent style, low quality render',
    cinemaStyle: 'Vibrant saturated animated palette, cinematic depth of field, dramatic animated lighting, expressive character close-ups, rich world-building environments',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Setup → Conflict → Resolution',
    environmentInclude: 'Richly detailed animated world, expressive character close-ups, animated environmental effects — wind, rain, light beams, particle effects, animated foliage, cinematic depth with foreground elements',
    environmentExclude: 'Real photography mixed in, low-poly game assets, flat shading, static background, unanimated crowd, broken character rigs, inconsistent art style',
    voiceoverTemplate: "In a world where [setup], our hero faces [challenge]. But everything changes when [turning point]. Watch what happens when someone refuses to give up. [Story beats]. Because the greatest stories aren't given — they're earned.",
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

  // ── Lifestyle fallback (not shown in dropdown but used as default) ───────────
  lifestyle: {
    name: 'Lifestyle · Daily Life · Vlog',
    key: 'lifestyle',
    triggerKeywords: ['lifestyle', 'daily life', 'vlog', 'day in my life', 'routine', 'morning', 'evening', 'get ready', 'haul', 'apartment', 'room tour', 'aesthetic'],
    negativeKeywords: ['war', 'battle', 'medieval', 'historical', 'surgery', 'medical'],
    imagePromptPrefix: 'Authentic everyday moments. Real environments — home, cafe, street, park. Natural and relatable person in natural setting.',
    videoPromptPrefix: 'Natural casual movement. Walking, sitting, preparing food, getting ready. Unforced everyday behaviour.',
    negativePrompt: 'war, battle, blood, medieval, corporate boardroom, laboratory, hospital, fantasy, CGI, unrealistic',
    cinemaStyle: 'Soft natural lighting, warm tones, shallow depth of field, intimate handheld feel',
    defaultDuration: 10,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Moment → Connection → Feeling',
    environmentInclude: 'Real home interior, coffee shop window seat, park bench, apartment balcony, cozy bedroom corner, farmers market stall, neighbourhood street, bathroom mirror',
    environmentExclude: 'Corporate office, laboratory, operating room, battlefield, factory floor, courtroom, fantasy realm',
    voiceoverTemplate: "This is my [morning/evening] routine and it changed everything. First: [habit 1]. Then: [habit 2]. And this one — [habit 3] — I've been doing every single day. It's the small things that add up. What's your non-negotiable daily habit?",
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

// ── Legacy alias for backwards compatibility ───────────────────────────────────
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

// ── Niche resolver — score-based keyword matching ─────────────────────────────

export function getNicheSettings(input: string | null | undefined): NicheSettings {
  if (!input?.trim()) {
    console.log(`[NICHE_RESOLVED] no input — resolved="lifestyle" (default)`);
    return NICHE_SETTINGS['lifestyle'];
  }

  const raw = input.toLowerCase().trim();

  // 1. Direct key match
  if (NICHE_SETTINGS[raw]) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${raw}" (direct)`);
    return NICHE_SETTINGS[raw];
  }

  // 2. Score-based match using triggerKeywords (+12) and negativeKeywords (-20)
  let bestMatch: NicheSettings | null = null;
  let highestScore = 0;

  for (const settings of Object.values(NICHE_SETTINGS)) {
    let score = 0;
    for (const kw of settings.triggerKeywords) {
      if (raw.includes(kw.toLowerCase())) score += 12;
    }
    for (const neg of settings.negativeKeywords) {
      if (raw.includes(neg.toLowerCase())) score -= 20;
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = settings;
    }
  }

  if (bestMatch && highestScore >= 10) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${bestMatch.key}" score=${highestScore}`);
    return bestMatch;
  }

  // 3. Partial key match — any known key appears inside the niche string
  const partialKey = Object.keys(NICHE_SETTINGS).find(k => raw.includes(k));
  if (partialKey) {
    console.log(`[NICHE_RESOLVED] input="${input}" resolved="${partialKey}" (partial)`);
    return NICHE_SETTINGS[partialKey];
  }

  // 4. Default
  console.log(`[NICHE_RESOLVED] input="${input}" resolved="lifestyle" (default)`);
  return NICHE_SETTINGS['lifestyle'];
}

// ── Convenience: get all public niches for dropdown ──────────────────────────

export function getPublicNiches(): Array<{ key: string; name: string }> {
  return Object.values(NICHE_SETTINGS)
    .filter(n => n.key !== 'lifestyle')
    .map(n => ({ key: n.key, name: n.name }));
}
