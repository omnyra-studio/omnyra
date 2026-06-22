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
}

export const NICHE_SETTINGS: Record<string, NicheSettings> = {

  history: {
    name: 'History',
    key: 'history',
    triggerKeywords: ['history', 'historical', 'ancient', 'roman empire', 'ww2', 'wwii', 'world war', 'civil war', 'medieval', 'victorian', 'renaissance', 'colonial', 'revolution', '1800s', '1900s', '1940s', 'pharaoh', 'gladiator', 'samurai', 'viking', 'crusade', 'empire', 'dynasty', 'battle of', 'siege', 'd-day', 'soldier'],
    negativeKeywords: ['fantasy', 'game', 'fiction', 'cosplay', 'anime', 'superhero', 'sci-fi'],
    imagePromptPrefix: 'Historically accurate period setting. Era-accurate clothing, weapons, architecture, and props. WWII/1940s military: olive drab wool US Army uniform, metal military cot, wool blanket, canvas walls, dim hanging bare incandescent bulb, wooden floor, dog tags, leather boots, military gear in background. Photorealistic cinematic, film grain, moody volumetric lighting. No modern objects, no contemporary clothing, no synthetic materials.',
    videoPromptPrefix: 'Historically authentic. Young adult male approximately 19-22 years old, fair skin, short hair, tired but alert expression. WWII military: olive drab wool shirt, dog tags, leather boots, metal cot with wool blanket. Dim hanging bare incandescent bulb or candlelight only. Natural subtle motion — breathing, slight weight shift, hands on knees. No modern objects, no contemporary decor, no bright lighting.',
    negativePrompt: 'modern, contemporary, fluorescent light, fluorescent strip, cyan light, blue LED, teal glow, neon, futuristic lighting, cool-toned light, plastic, synthetic, digital screen, smartphone, modern furniture, IKEA, sneakers, t-shirt, jeans, hoodie, modern lamp, potted plants, contemporary decor, cosplay, halloween costume, bright studio lighting, static mannequin pose, chrome, stainless steel, modern helmet, tactical gear, body armor, kevlar, night vision, laser sight, post-2000 equipment, high-tech military, OLED, LCD, tactical vest, modern camouflage pattern',
    cinemaStyle: 'Cinematic film grain, desaturated period-accurate colour palette (olive drab, khaki, shadow grey), natural candlelight or single bare-bulb incandescent, slow deliberate camera movement, moody volumetric light shafts',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: true,
    emotionalArc: 'Context → Tension → Revelation',
    environmentInclude: 'Steel-frame bunk beds, thin mattresses, rough wool blankets, bare concrete or wooden plank floor, bare incandescent bulb hanging from wire or oil lamp, canvas kit bags, steel helmets, canteens, wooden footlockers, rough wooden support posts, small high windows with no curtains, institutional military setting',
    environmentExclude: 'Standing floor lamps, lampshades, curtains, drapes, upholstered furniture, armchairs, sofas, side tables, carpet, rugs, picture frames, home furniture, modern light fixtures, hotel room, living room, decorative items',
  },

  'true-stories-documentary': {
    name: 'True Stories · Documentary',
    key: 'true-stories-documentary',
    triggerKeywords: ['true story', 'based on true events', 'real life', 'documentary', 'real events', 'actually happened', 'true crime', 'unsolved', 'investigation', 'real footage', 'testimony', 'witness', 'survivor'],
    negativeKeywords: ['fiction', 'fantasy', 'anime', 'game', 'made up'],
    imagePromptPrefix: 'Documentary-style authentic setting. Real locations, natural environments. Raw and unpolished feel. No studio perfection.',
    videoPromptPrefix: 'Documentary intimacy. Natural human behaviour. Observational camera, not staged.',
    negativePrompt: 'fantasy, magical, cartoon, anime, CGI, green screen, studio lighting, perfect makeup, glamorous, overly staged',
    cinemaStyle: 'Documentary cinematic, natural lighting, intimate handheld feel, authentic grain, observational pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: true,
    emotionalArc: 'Story build → Climax → Reflection',
    environmentInclude: 'Real unpolished locations, natural imperfections, visible wear on surfaces, authentic clutter, real-world signage, natural window light, everyday objects in use, lived-in spaces',
    environmentExclude: 'Studio backdrops, perfect lighting, green screen, pristine sets, magazine-ready rooms, stock photo feel, overly styled environments',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Struggle → Breakthrough → Triumph',
    environmentInclude: 'Outdoor sunrise or sunset, mountain peak, running track, empty road stretching ahead, gym at dawn, rooftop with city skyline, open field, staircase, boxing ring, weight room',
    environmentExclude: 'Couch, bed, messy room, dark basement, cluttered desk, junk food, TV screen, gaming chair, nightclub',
  },

  'business-entrepreneurship': {
    name: 'Business · Entrepreneurship · Success',
    key: 'business-entrepreneurship',
    triggerKeywords: ['business', 'entrepreneur', 'startup', 'success story', 'hustle', 'ceo', 'founder', 'company', 'revenue', 'profit', 'scale', 'growth', 'leadership', 'deal', 'pitch', 'investor', 'venture'],
    negativeKeywords: ['gaming', 'cosplay', 'anime', 'cooking', 'recipe'],
    imagePromptPrefix: 'Professional, modern, clean environment. Boardrooms, offices, workspaces, skyline views. Sharp and confident subjects.',
    videoPromptPrefix: 'Confident deliberate movement. Professional body language. Purpose in every gesture.',
    negativePrompt: 'messy, cluttered, casual, pajamas, bedroom, cartoon, fantasy, medieval, beach lounging, gaming setup',
    cinemaStyle: 'Sharp modern, professional lighting, cool-toned or neutral, fast-paced confident cuts',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Strategy → Victory',
    environmentInclude: 'Glass-walled office, conference table, whiteboard with notes, laptop open, skyline through window, co-working space, presentation screen, standing desk, modern workspace',
    environmentExclude: 'Bedroom, kitchen, messy apartment, gaming setup, gym, playground, beach lounge, medieval castle, fantasy setting',
  },

  'personal-finance': {
    name: 'Personal Finance',
    key: 'personal-finance',
    triggerKeywords: ['personal finance', 'budget', 'saving money', 'debt free', 'credit score', 'bank account', 'emergency fund', 'financial freedom', 'paycheck', 'expenses', 'bills', 'mortgage'],
    negativeKeywords: ['crypto trading', 'stock picks', 'gambling', 'betting', 'get rich quick'],
    imagePromptPrefix: 'Clean, approachable, everyday financial setting. Kitchen table with bills, phone calculator, notebook with budget. Real person managing real money.',
    videoPromptPrefix: 'Relatable everyday movement. Person reviewing, writing, calculating. Calm and focused.',
    negativePrompt: 'luxury mansion, yacht, lamborghini, stock charts, trading screen, casino, flashy jewelry, stacks of cash, private jet',
    cinemaStyle: 'Warm and approachable, soft natural lighting, clean compositions, trustworthy feel',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Plan → Progress',
    environmentInclude: 'Kitchen table with bills and calculator, notebook with handwritten budget, phone showing banking app, organised filing, piggy bank, envelopes for cash budgeting, grocery receipt',
    environmentExclude: 'Luxury mansion, yacht, sports car, champagne, designer store, penthouse, stacks of cash, gold bars, casino chips',
  },

  investing: {
    name: 'Investing',
    key: 'investing',
    triggerKeywords: ['investing', 'investment', 'stocks', 'etf', 'portfolio', 'dividend', 'compound interest', 'index fund', 'market', 'bull', 'bear', 'returns', 'passive income investing'],
    negativeKeywords: ['gambling', 'betting', 'casino', 'lottery', 'get rich quick', 'crypto scam'],
    imagePromptPrefix: 'Professional financial environment. Clean desk, monitor with charts, notebook, coffee. Smart analytical person reviewing data.',
    videoPromptPrefix: 'Measured analytical movement. Person studying, researching, writing notes. Thoughtful pacing.',
    negativePrompt: 'gambling, casino, roulette, lottery, flashy cars, stacks of cash, party, nightclub, fast fashion',
    cinemaStyle: 'Clean professional, blue-tinted or neutral tones, sharp focus, modern minimal',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Research → Decision → Growth',
    environmentInclude: 'Clean desk with monitor showing charts, financial newspaper, notebook with analysis, coffee cup, calculator, bookshelf with finance books, quiet home office',
    environmentExclude: 'Casino, roulette wheel, lottery tickets, slot machine, stacks of cash, flashy cars, nightclub, party',
  },

  'side-hustles': {
    name: 'Side Hustles',
    key: 'side-hustles',
    triggerKeywords: ['side hustle', 'side income', 'extra money', 'freelance', 'gig', 'passive income', 'make money online', 'dropshipping', 'print on demand', 'reselling', 'etsy', 'fiverr'],
    negativeKeywords: ['scam', 'pyramid scheme', 'mlm', 'gambling'],
    imagePromptPrefix: 'Real person working from home or casual workspace. Laptop, phone, shipping boxes, product photos. Authentic hustle not glamour.',
    videoPromptPrefix: 'Energetic multitasking movement. Packing orders, typing, photographing products. Real work visible.',
    negativePrompt: 'luxury mansion, yacht, lamborghini, private jet, unrealistic wealth, casino, beach lounging doing nothing, pyramid scheme',
    cinemaStyle: 'Authentic and energetic, natural indoor lighting, slightly warm tones, real environment',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Idea → Hustle → Result',
    environmentInclude: 'Home desk with laptop and shipping supplies, packing tape, product boxes, label printer, phone with seller app, garage workspace, craft supplies, inventory shelves',
    environmentExclude: 'Luxury car, private jet, mansion, penthouse, designer clothes, beach with cocktail, passive lounging',
  },

  'money-saving': {
    name: 'Money Saving Hacks',
    key: 'money-saving',
    triggerKeywords: ['money saving', 'save money', 'frugal', 'coupon', 'discount', 'cheap', 'budget hack', 'thrifty', 'deal', 'clearance', 'dupe', 'alternative'],
    negativeKeywords: ['luxury', 'designer', 'expensive', 'premium', 'splurge'],
    imagePromptPrefix: 'Practical everyday setting. Grocery store, kitchen, phone showing deals, organised pantry. Real and relatable.',
    videoPromptPrefix: 'Quick practical movement. Showing, comparing, organising, demonstrating a hack. Hands-on action.',
    negativePrompt: 'luxury, designer, expensive, mansion, yacht, premium brand, high-end restaurant, first class, private jet',
    cinemaStyle: 'Bright clean, slightly warm, approachable, tutorial feel, clear compositions',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Hack → Savings',
    environmentInclude: 'Grocery store aisle, coupon organiser, bulk buy items, reusable containers, comparison shopping on phone, thrift store rack, clearance tags, meal prep containers',
    environmentExclude: 'Designer store, luxury brand, premium restaurant, first class cabin, five-star hotel, expensive wine, brand new car',
  },

  lifestyle: {
    name: 'Lifestyle · Daily Life · Vlog',
    key: 'lifestyle',
    triggerKeywords: ['lifestyle', 'daily life', 'vlog', 'day in my life', 'routine', 'morning', 'evening', 'get ready', 'haul', 'apartment', 'room tour', 'aesthetic'],
    negativeKeywords: ['war', 'battle', 'medieval', 'historical', 'surgery', 'medical'],
    imagePromptPrefix: 'Authentic everyday moments. Real environments — home, cafe, street, park. Natural and relatable person in natural setting.',
    videoPromptPrefix: 'Natural casual movement. Walking, sitting, preparing food, getting ready. Unforced everyday behaviour.',
    negativePrompt: 'war, battle, blood, medieval, corporate boardroom, laboratory, hospital, fantasy, CGI, unrealistic',
    cinemaStyle: 'Soft natural lighting, warm tones, shallow depth of field, intimate handheld feel',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Moment → Connection → Feeling',
    environmentInclude: 'Real home interior, coffee shop window seat, park bench, apartment balcony, cozy bedroom corner, farmers market stall, neighbourhood street, bathroom mirror',
    environmentExclude: 'Corporate office, laboratory, operating room, battlefield, factory floor, courtroom, fantasy realm',
  },

  trends: {
    name: 'Trends',
    key: 'trends',
    triggerKeywords: ['trending', 'trend', 'viral', 'challenge', 'what everyone is', 'new thing', 'popular', 'blowing up', 'everyone is talking'],
    negativeKeywords: ['historical', 'ancient', 'medieval'],
    imagePromptPrefix: 'Current, contemporary, pop culture feel. Bold colours, dynamic compositions, attention-grabbing.',
    videoPromptPrefix: 'Fast energetic movement. Quick transitions implied. High energy, attention-grabbing action.',
    negativePrompt: 'historical, old-fashioned, dated, boring, static, plain, muted colours, vintage sepia',
    cinemaStyle: 'Bold saturated colours, fast dynamic camera, high energy, punchy lighting, modern',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Hook → Show → React',
    environmentInclude: 'Bright contemporary space, neon signs, bold wall colours, trendy cafe, pop-up store, urban street art wall, ring light setup, phone on tripod',
    environmentExclude: 'Historical setting, dusty antique shop, rural farm, traditional formal office, dated furniture, brown earth tones, plain beige walls',
  },

  'health-wellness': {
    name: 'Health & Wellness',
    key: 'health-wellness',
    triggerKeywords: ['health', 'wellness', 'healthy', 'immune', 'gut health', 'sleep', 'hydration', 'nutrition', 'supplement', 'holistic', 'detox', 'anti-inflammatory', 'hormone'],
    negativeKeywords: ['bodybuilding', 'bulk', 'shred', 'competition', 'fight', 'combat'],
    imagePromptPrefix: 'Clean, bright, healthy environment. Kitchen with whole foods, outdoor nature, yoga mat, calm interior. Person radiating calm health.',
    videoPromptPrefix: 'Gentle measured movement. Preparing food, stretching, walking in nature, breathing deeply. Calm presence.',
    negativePrompt: 'gym, heavy weights, bodybuilding, protein shake, sweaty, aggressive, fast food, junk food, medical equipment, hospital',
    cinemaStyle: 'Bright airy, natural sunlight, green and earth tones, soft focus, calm pacing',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Awareness → Practice → Balance',
    environmentInclude: 'Bright kitchen with whole foods on counter, yoga mat near window, nature trail, herbal tea setup, meditation corner with cushion, farmers market produce, smoothie ingredients, morning sunlight',
    environmentExclude: 'Heavy gym equipment, protein powder tubs, bodybuilding posters, hospital ward, surgical tools, fast food restaurant, dark bar, cigarettes',
  },

  fitness: {
    name: 'Fitness',
    key: 'fitness',
    triggerKeywords: ['fitness', 'workout', 'gym', 'exercise', 'lift', 'squat', 'deadlift', 'bench press', 'cardio', 'hiit', 'crossfit', 'gains', 'muscle', 'reps', 'sets', 'training'],
    negativeKeywords: ['meditation', 'spa', 'massage', 'cooking', 'recipe'],
    imagePromptPrefix: 'Gym or outdoor training environment. Athletic person mid-exercise. Visible effort, form, and determination.',
    videoPromptPrefix: 'Powerful athletic movement. Lifting, running, jumping, pulling. Explosive physical action.',
    negativePrompt: 'sedentary, sitting, desk, office, cooking, sleeping, relaxing, spa, meditation cushion, pajamas',
    cinemaStyle: 'High contrast, dramatic gym lighting, dynamic angles, slow-motion on effort moments',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Challenge → Effort → Achievement',
    environmentInclude: 'Gym floor with squat rack and plates, rubber mat, dumbbells, pull-up bar, running track, outdoor park workout area, jump rope, kettlebells, gym mirror',
    environmentExclude: 'Couch, bed, dining table, office desk, cooking kitchen, beauty vanity, meditation cushion, spa',
  },

  luxury: {
    name: 'Luxury · Designer · High-End Living',
    key: 'luxury',
    triggerKeywords: ['luxury', 'designer', 'high end', 'premium', 'exclusive', 'penthouse', 'rolex', 'gucci', 'louis vuitton', 'ferrari', 'lamborghini', 'yacht', 'private jet', 'first class', 'fine dining', 'champagne'],
    negativeKeywords: ['budget', 'cheap', 'thrift', 'frugal', 'broken', 'damaged', 'wreck', 'junkyard', 'burnt', 'rusted', 'abandoned', 'poverty'],
    imagePromptPrefix: 'Pristine luxury environment. Immaculate interiors, polished surfaces, premium materials — marble, leather, crystal, gold accents. Everything clean, new, aspirational.',
    videoPromptPrefix: 'Elegant refined movement. Slow deliberate gestures. Person interacting with luxury items gracefully.',
    negativePrompt: 'cheap, broken, damaged, burnt, rusted, abandoned, junkyard, trash, messy, dirty, cluttered, graffiti, poverty, run-down, budget, discount, thrift store, fast food, crumbling',
    cinemaStyle: 'Rich warm tones, golden lighting, shallow depth of field, slow elegant camera movement, magazine-quality composition',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Aspiration → Experience → Indulgence',
    environmentInclude: 'Marble floor, crystal chandelier, leather seating, gold accents, polished surfaces, penthouse view, designer boutique interior, champagne glass, fresh flowers in crystal vase, silk fabric, walnut wood',
    environmentExclude: 'Broken items, rust, peeling paint, graffiti, trash, dirt, budget store, plastic furniture, worn carpet, fast food, junkyard, abandoned building, damaged vehicle',
  },

  sustainability: {
    name: 'Sustainability & Eco-Friendly Living',
    key: 'sustainability',
    triggerKeywords: ['sustainability', 'eco friendly', 'zero waste', 'recycle', 'compost', 'solar', 'renewable', 'green living', 'plastic free', 'carbon footprint', 'climate', 'thrift', 'upcycle'],
    negativeKeywords: ['fast fashion', 'disposable', 'luxury car', 'private jet', 'mega yacht'],
    imagePromptPrefix: 'Natural green environment. Gardens, farmers markets, reusable containers, solar panels, bamboo products. Person actively making sustainable choices.',
    videoPromptPrefix: 'Purposeful gentle movement. Planting, sorting, composting, refilling, carrying reusable bags.',
    negativePrompt: 'plastic waste, pollution, smokestacks, fast fashion, disposable cups, private jet, mega yacht, excessive packaging, littering',
    cinemaStyle: 'Natural earthy tones, golden green palette, outdoor sunlight, gentle handheld, documentary warmth',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Awareness → Action → Impact',
    environmentInclude: 'Community garden, compost bin, solar panels on roof, reusable bag collection, bamboo products, glass jars for storage, bicycle, farmers market, rain barrel, wildflower patch',
    environmentExclude: 'Plastic bottles piled up, fast fashion store, disposable cups, private jet, mega yacht, excessive packaging, factory smokestacks',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Problem → Innovation → Future',
    environmentInclude: 'Multiple monitors with code or UI, mechanical keyboard, clean desk with devices, server rack lights, drone on desk, smart home devices, VR headset, circuit board close-up',
    environmentExclude: 'Rustic cabin, farmhouse, candlelit room, handwritten notes only, medieval setting, no-technology environment, old-fashioned typewriter',
  },

  'nomad-lifestyle': {
    name: 'Nomad Lifestyle & Cultures',
    key: 'nomad-lifestyle',
    triggerKeywords: ['nomad', 'digital nomad', 'travel', 'backpacking', 'hostel', 'explore', 'culture', 'adventure', 'passport', 'airport', 'destination', 'remote work travel', 'van life'],
    negativeKeywords: ['office', 'corporate', 'cubicle', 'commute'],
    imagePromptPrefix: 'Exotic or diverse locations. Cafes abroad, mountain trails, beaches, markets, temples, hostel life. Person with backpack or laptop in unfamiliar setting.',
    videoPromptPrefix: 'Free flowing movement. Walking through markets, setting up laptop in cafe, exploring streets, gazing at landscapes.',
    negativePrompt: 'office cubicle, corporate, suburban house, commute, grey city, boring, fluorescent lights, desk job',
    cinemaStyle: 'Vibrant warm tones, golden travel light, wide establishing shots, intimate moments, adventure pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Departure → Discovery → Belonging',
    environmentInclude: 'Cafe in foreign city with laptop, backpack on hostel bed, temple steps, mountain trail vista, airport departure board, street market stall, co-working space abroad, van interior with bedding',
    environmentExclude: 'Suburban office cubicle, commuter train, grey city car park, corporate conference room, identical apartment complex',
  },

  'music-dance': {
    name: 'Music & Dance',
    key: 'music-dance',
    triggerKeywords: ['music', 'dance', 'singer', 'rapper', 'beat', 'rhythm', 'choreography', 'concert', 'performance', 'dj', 'producer', 'studio recording', 'freestyle', 'instrument', 'guitar', 'piano', 'drums'],
    negativeKeywords: ['cooking', 'finance', 'business', 'medical'],
    imagePromptPrefix: 'Performance or studio environment. Stage lighting, recording booth, dance floor, instruments. Person mid-performance or mid-practice.',
    videoPromptPrefix: 'Rhythmic expressive movement. Dancing, playing instrument, singing, moving to music. Body fully engaged with sound.',
    negativePrompt: 'office, desk, cooking, medical, corporate, spreadsheet, classroom lecture, static sitting, car dealership',
    cinemaStyle: 'Dynamic stage lighting, coloured gels, high energy cuts, rhythm-synced camera movement, concert feel',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Buildup → Performance → Release',
    environmentInclude: 'Stage with coloured lights, recording studio booth, microphone on stand, DJ turntable, dance studio mirror wall, instrument close-up, concert crowd silhouette, headphones on mixing desk',
    environmentExclude: 'Office desk, spreadsheet on screen, kitchen counter, medical exam room, courtroom, library study table',
  },

  'news-politics': {
    name: 'News & Politics',
    key: 'news-politics',
    triggerKeywords: ['news', 'politics', 'election', 'government', 'policy', 'president', 'congress', 'parliament', 'law', 'legislation', 'protest', 'rally', 'breaking news', 'geopolitics'],
    negativeKeywords: ['gaming', 'anime', 'cosplay', 'recipe', 'beauty'],
    imagePromptPrefix: 'Formal or civic setting. Government buildings, press conferences, newsrooms, protest crowds, courtrooms. Serious tone.',
    videoPromptPrefix: 'Authoritative measured movement. Speaker at podium, reporter on location, crowd gathering. Purposeful and serious.',
    negativePrompt: 'cartoon, anime, gaming, fantasy, casual, silly, party, beach, cosplay, cooking, beauty counter',
    cinemaStyle: 'Neutral formal tones, sharp journalism-grade lighting, steady camera, clean framing, serious pacing',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: true,
    emotionalArc: 'Event → Context → Impact',
    environmentInclude: 'Government building steps, press conference podium, newsroom with monitors, protest crowd with signs, parliament chamber, courthouse exterior, press pass, microphone forest',
    environmentExclude: 'Gaming room, anime poster, cooking show set, beauty salon, beach party, fantasy castle, cartoon world',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Moment → Emotion → Growth',
    environmentInclude: 'School hallway with lockers, bedroom with fairy lights and posters, park with friends, school cafeteria, sports field sideline, library study table, phone screen showing group chat',
    environmentExclude: 'Bar, nightclub, alcohol bottles, cigarettes, weapons, adult workplace, casino, dark alley, anything sexually suggestive',
  },

  'cars-motors': {
    name: 'Cars & Motors',
    key: 'cars-motors',
    triggerKeywords: ['car', 'cars', 'motor', 'vehicle', 'supercar', 'engine', 'horsepower', 'race', 'drift', 'modification', 'exhaust', 'turbo', 'motorcycle', 'truck', 'classic car', 'garage'],
    negativeKeywords: ['cooking', 'beauty', 'makeup', 'skincare', 'yoga', 'meditation'],
    imagePromptPrefix: 'Automotive environment. Garage, showroom, race track, open road, car meet. Vehicle as hero subject, clean and detailed.',
    videoPromptPrefix: 'Dynamic automotive movement. Car in motion, engine starting, driving POV, wheels spinning, doors opening. Speed and power.',
    negativePrompt: 'kitchen, cooking, beauty counter, yoga mat, office desk, bedroom, garden, flowers, hospital',
    cinemaStyle: 'High contrast, dramatic reflections, low angle hero shots, dynamic tracking camera',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Reveal → Action → Impact',
    environmentInclude: 'Clean garage with tool wall, showroom floor, race track tarmac, open highway stretching ahead, car meet parking lot, engine bay close-up, polished wheel detail, driver seat cockpit view',
    environmentExclude: 'Kitchen, yoga studio, beauty salon, office cubicle, flower garden, bedroom, classroom, hospital',
  },

  diy: {
    name: 'DIY',
    key: 'diy',
    triggerKeywords: ['diy', 'do it yourself', 'build', 'craft', 'handmade', 'woodworking', 'renovation', 'repair', 'project', 'tools', 'workshop', 'paint', 'restore', 'fix', 'make', 'create'],
    negativeKeywords: ['buy', 'purchase', 'luxury', 'designer', 'unboxing'],
    imagePromptPrefix: 'Workshop or home project environment. Tools, materials, work-in-progress. Hands actively building, cutting, painting, assembling.',
    videoPromptPrefix: 'Hands-on building movement. Sawing, hammering, painting, measuring, assembling. Process visible step by step.',
    negativePrompt: 'luxury store, shopping mall, unboxing, factory, mass production, corporate, office, fine dining',
    cinemaStyle: 'Warm workshop tones, close-up on hands and materials, satisfying process shots, natural lighting',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Plan → Build → Reveal',
    environmentInclude: 'Workbench with tools organised, sawdust on floor, measuring tape and pencil, clamps holding wood, paint cans and brushes, drill and screws laid out, partially built project, safety goggles',
    environmentExclude: 'Luxury store, shopping mall, unboxing from Amazon, factory assembly line, corporate office, empty sterile room',
  },

  'skill-improvement': {
    name: 'Skill Improvement & Education',
    key: 'skill-improvement',
    triggerKeywords: ['learn', 'education', 'skill', 'tutorial', 'how to', 'course', 'study', 'practice', 'improve', 'master', 'lesson', 'technique', 'training', 'knowledge'],
    negativeKeywords: ['entertainment', 'comedy', 'prank', 'meme'],
    imagePromptPrefix: 'Learning environment. Desk with books, whiteboard, laptop with course, library, practice space. Person focused on learning.',
    videoPromptPrefix: 'Focused learning movement. Writing notes, practicing skill, demonstrating technique, explaining with gestures.',
    negativePrompt: 'party, nightclub, gaming, lounging, sleeping, comedy, prank, silly, meme, dancing',
    cinemaStyle: 'Clean informative, good lighting, clear compositions, educational but engaging, medium pacing',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Question → Practice → Mastery',
    environmentInclude: 'Desk with open textbook and notebook, laptop showing tutorial, whiteboard with diagrams, practice instrument, language flashcards, highlighted study notes, library carrel, online course on screen',
    environmentExclude: 'Nightclub, party, gaming setup, TV with entertainment, couch lounging, bar, messy floor',
  },

  relationships: {
    name: 'Relationships & Love',
    key: 'relationships',
    triggerKeywords: ['relationship', 'love', 'couple', 'marriage', 'partner', 'romance', 'anniversary', 'proposal', 'together', 'long distance', 'soulmate', 'boyfriend', 'girlfriend', 'husband', 'wife'],
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
  },

  dating: {
    name: 'Dating & Advice',
    key: 'dating',
    triggerKeywords: ['dating', 'first date', 'dating advice', 'dating tips', 'single', 'talking stage', 'red flags', 'green flags', 'situationship', 'tinder', 'bumble', 'hinge', 'attraction'],
    negativeKeywords: ['marriage counseling', 'divorce', 'breakup recovery', 'custody'],
    imagePromptPrefix: 'Social dating environment. Coffee shop, restaurant, bar, park bench, phone with dating app. Two people meeting or one person preparing.',
    videoPromptPrefix: 'Nervous anticipatory movement. Checking phone, adjusting outfit, arriving at location, first eye contact.',
    negativePrompt: 'wedding ceremony, birth, baby, divorce courtroom, stalking, obsessive, crying divorce',
    cinemaStyle: 'Warm inviting, soft evening lighting, urban atmosphere, candid feel, gentle anticipation',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Anticipation → Meeting → Spark',
    environmentInclude: 'Coffee shop two-top table, restaurant booth, park meeting spot, bar counter with two drinks, phone showing dating app, getting-ready mirror, walking toward each other on street',
    environmentExclude: 'Wedding venue, baby nursery, divorce papers, courtroom, empty apartment alone crying, stalking scene',
  },

  friendships: {
    name: 'Friendships & Social Life',
    key: 'friendships',
    triggerKeywords: ['friendship', 'friends', 'best friend', 'squad', 'crew', 'girls night', 'boys night', 'hangout', 'reunion', 'group chat', 'bestie', 'loyal', 'bff'],
    negativeKeywords: ['romance', 'proposal', 'wedding', 'divorce'],
    imagePromptPrefix: 'Social group setting. Friends together — laughing, walking, eating, playing. Parks, cafes, living rooms, adventures. Multiple people, authentic joy.',
    videoPromptPrefix: 'Group social movement. Laughing together, high-fiving, hugging, talking animatedly, walking as a group.',
    negativePrompt: 'alone isolated, romantic couple only, wedding ceremony, proposal, formal corporate event',
    cinemaStyle: 'Warm vibrant, natural daylight or cozy indoor, candid group shots, energetic but heartfelt',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Gathering → Moment → Bond',
    environmentInclude: 'Living room floor with snacks, park picnic blanket, restaurant long table, hiking trail group, road trip car packed, kitchen cooking together, backyard fire pit, bowling alley',
    environmentExclude: 'Romantic dinner for two, wedding altar, solo desk, corporate boardroom, dark lonely room, formal gala',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Before → Process → Glow',
    environmentInclude: 'Vanity mirror with ring light, bathroom counter with products arranged, cotton pads and serums, face close-up with dewy skin, makeup palette open, brush set, clean white towel, skincare fridge',
    environmentExclude: 'Garage, engine grease, construction site, muddy field, sweaty gym, dark industrial space, welding sparks',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Prep → Cook → Serve',
    environmentInclude: 'Kitchen counter with ingredients prepped, cutting board with knife and vegetables, stovetop with pan and steam, oven with golden bake visible, plated dish on table, herbs and spices jars, mixing bowl mid-action',
    environmentExclude: 'Laboratory, medical equipment, gym weights, gaming monitor, car engine, office printer, construction tools',
  },

  'fashion-style': {
    name: 'Fashion · Style',
    key: 'fashion-style',
    triggerKeywords: ['fashion', 'style', 'outfit', 'ootd', 'streetwear', 'runway', 'wardrobe', 'clothing', 'dress', 'sneakers', 'accessories', 'trend', 'lookbook', 'thrift flip'],
    negativeKeywords: ['cooking', 'coding', 'programming', 'gaming', 'gym workout'],
    imagePromptPrefix: 'Fashion-forward environment. Urban street, studio backdrop, mirror selfie setup, boutique. Person showcasing outfit with confident posture.',
    videoPromptPrefix: 'Confident stylish movement. Walking, turning, posing, adjusting clothing, outfit transitions.',
    negativePrompt: 'gym clothes only, pajamas, hospital gown, construction gear, medieval armour, hazmat suit, cooking apron',
    cinemaStyle: 'Magazine-quality, editorial lighting, clean backgrounds, bold colour pops, confident pacing',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Reveal → Showcase → Impact',
    environmentInclude: 'Full-length mirror, clothing rack with curated pieces, urban brick wall backdrop, boutique interior, shoe collection shelf, sunglasses and accessories flat lay, street style sidewalk, studio with simple backdrop',
    environmentExclude: 'Gym in workout clothes only, hospital gown, construction helmet, hazmat suit, medieval armour, chef apron and kitchen',
  },

  gaming: {
    name: 'Gaming',
    key: 'gaming',
    triggerKeywords: ['gaming', 'gamer', 'video game', 'gameplay', 'esports', 'twitch', 'stream', 'playstation', 'xbox', 'nintendo', 'pc gaming', 'controller', 'headset', 'fortnite', 'minecraft', 'valorant'],
    negativeKeywords: ['cooking', 'beauty', 'skincare', 'fashion', 'recipe', 'yoga'],
    imagePromptPrefix: 'Gaming environment. RGB-lit setup, monitors, controller in hand, headset on, dark room with screen glow. Player fully immersed.',
    videoPromptPrefix: 'Reactive gaming movement. Quick hand movements on controller, leaning forward, reacting to screen, celebrating or frustrated.',
    negativePrompt: 'kitchen, cooking, beauty counter, outdoor hiking, yoga, garden, formal office, classroom lecture',
    cinemaStyle: 'RGB and screen glow, neon accent lighting, dark environment, dynamic close-ups on hands and face',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Setup → Play → Clutch',
    environmentInclude: 'RGB-lit desk setup, dual monitors with game on screen, mechanical keyboard with coloured keys, gaming headset, controller in hand, mousepad with wrist rest, LED strip behind monitor, dark room with screen glow',
    environmentExclude: 'Outdoor hiking trail, kitchen cooking, beauty vanity, yoga mat, formal office desk, garden with flowers, library quiet zone',
  },

  spirituality: {
    name: 'Spirituality · Faith',
    key: 'spirituality',
    triggerKeywords: ['spirituality', 'faith', 'god', 'prayer', 'bible', 'quran', 'meditation', 'soul', 'divine', 'church', 'mosque', 'temple', 'spiritual', 'higher power', 'enlightenment', 'chakra', 'manifestation'],
    negativeKeywords: ['occult harmful', 'dark magic', 'curse', 'hex'],
    imagePromptPrefix: 'Peaceful sacred environment. Temple, church, nature, meditation space, candlelight, prayer beads. Person in quiet contemplation.',
    videoPromptPrefix: 'Slow reverent movement. Praying, meditating, walking in nature, lighting candle, hands together. Stillness and peace.',
    negativePrompt: 'horror, demonic, dark magic, gore, violence, nightclub, rave, loud party, aggressive, occult',
    cinemaStyle: 'Ethereal soft, golden light, lens flare, slow graceful camera, warm peaceful tones, reverent pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Seeking → Stillness → Clarity',
    environmentInclude: 'Temple interior with soft light, meditation cushion on floor, prayer beads in hands, candle arrangement, incense smoke trail, natural setting with sunbeams through trees, church pew, sacred text open on table',
    environmentExclude: 'Nightclub, rave with strobes, horror scene, demonic imagery, loud concert, aggressive sports, casino, fast food restaurant',
  },

  'comedy-entertainment': {
    name: 'Comedy · Entertainment',
    key: 'comedy-entertainment',
    triggerKeywords: ['comedy', 'funny', 'humor', 'joke', 'skit', 'prank', 'meme', 'laugh', 'standup', 'parody', 'satire', 'roast', 'blooper', 'fail', 'reaction'],
    negativeKeywords: ['tragedy', 'death', 'war', 'funeral', 'terminal illness'],
    imagePromptPrefix: 'Expressive comedic setting. Exaggerated facial expressions, surprising situations, everyday locations turned absurd.',
    videoPromptPrefix: 'Exaggerated expressive movement. Double-takes, surprised reactions, physical comedy, timing-based gestures.',
    negativePrompt: 'serious, funeral, tragedy, war, hospital, crying grief, depression, violence, horror, death',
    cinemaStyle: 'Bright punchy, quick cuts implied, wide angles for physical comedy, expressive close-ups, energetic',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Setup → Punchline → Reaction',
    environmentInclude: 'Living room mid-reaction, kitchen with exaggerated mess, office with absurd situation, mirror with funny face, park with physical comedy setup, couch with snacks and surprised expression',
    environmentExclude: 'Funeral, hospital ICU, war zone, crime scene, courtroom sentencing, cemetery, disaster aftermath',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Meet → Bond → Joy',
    environmentInclude: 'Living room floor with pet toys, park grass with dog running, cat tree near window, pet bed with sleeping animal, vet exam table (friendly), food bowl being filled, garden with pet exploring, leash and collar close-up',
    environmentExclude: 'Animal testing lab, hunting scene, cramped cage, slaughterhouse, taxidermy, animal fight ring, neglected dirty kennel',
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
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Chaos → System → Control',
    environmentInclude: 'Clean desk with planner open, monitor with to-do app, timer visible, organised shelf with labelled boxes, morning coffee next to laptop, bullet journal with pen, standing desk, minimalist workspace',
    environmentExclude: 'Messy room with clothes everywhere, TV on with streaming, phone showing social media scroll, unmade bed at 2pm, junk food wrappers, overflowing trash',
  },

  minimalism: {
    name: 'Minimalism & Decluttering',
    key: 'minimalism',
    triggerKeywords: ['minimalism', 'minimalist', 'declutter', 'less is more', 'capsule wardrobe', 'simplify', 'tidy', 'konmari', 'downsize', 'essentialism', 'clean space', 'simple living'],
    negativeKeywords: ['hoarding', 'shopping haul', 'luxury haul', 'maximalist', 'collection'],
    imagePromptPrefix: 'Clean minimal space. White walls, single objects, empty surfaces, one plant, simple furniture. Breathable negative space everywhere.',
    videoPromptPrefix: 'Slow deliberate removal movement. Placing one object, opening empty drawer, folding single item. Less on screen, more space.',
    negativePrompt: 'cluttered, hoarding, piles of stuff, shopping bags, haul, excessive decoration, maximalist, crowded, chaotic',
    cinemaStyle: 'White and neutral, abundant negative space, very slow camera, clean lines, meditative pacing',
    defaultDuration: 8,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Excess → Release → Calm',
    environmentInclude: 'White wall with single framed item, empty shelf with one object, capsule wardrobe in open closet, clear desk with only laptop, single plant on windowsill, empty drawer, folded neutral clothing stack',
    environmentExclude: 'Cluttered room, shopping bags piled, excessive decoration, maximalist colour explosion, hoarding stacks, overflowing closet, multiple trinkets',
  },

  weddings: {
    name: 'Weddings & Events',
    key: 'weddings',
    triggerKeywords: ['wedding', 'bride', 'groom', 'ceremony', 'reception', 'engagement', 'bridal', 'vows', 'first dance', 'wedding dress', 'bouquet', 'venue', 'event planning'],
    negativeKeywords: ['divorce', 'breakup', 'funeral', 'fight'],
    imagePromptPrefix: 'Elegant event setting. Venue with flowers, arch, aisle, table settings, dress details. Joyful celebration atmosphere.',
    videoPromptPrefix: 'Graceful ceremonial movement. Walking aisle, exchanging rings, first dance, throwing bouquet. Emotional milestone moments.',
    negativePrompt: 'divorce, argument, broken, dark, depressing, funeral, black mourning, courtroom, crying from pain',
    cinemaStyle: 'Romantic soft, golden hour or fairy lights, shallow depth of field, gentle slow motion, dreamy',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Preparation → Moment → Celebration',
    environmentInclude: 'Flower arch ceremony backdrop, aisle with petals, reception table with candles and place settings, dress hanging in window light, ring box open, first dance floor, bride getting-ready mirror, bouquet close-up',
    environmentExclude: 'Divorce papers, courtroom, argument scene, black mourning clothes, empty apartment, broken items, funeral flowers',
  },

  sports: {
    name: 'Sports & Athletics',
    key: 'sports',
    triggerKeywords: ['sports', 'athletics', 'athlete', 'football', 'soccer', 'basketball', 'tennis', 'swimming', 'running', 'marathon', 'olympics', 'championship', 'match', 'game', 'score', 'team', 'coach'],
    negativeKeywords: ['esports', 'gaming', 'video game', 'cooking', 'beauty'],
    imagePromptPrefix: 'Athletic environment. Stadium, field, court, track, pool. Athlete mid-action — running, jumping, throwing, diving. Peak physical performance.',
    videoPromptPrefix: 'Explosive athletic movement. Sprinting, kicking, dunking, diving, celebrating. Full-body athletic power.',
    negativePrompt: 'gaming chair, computer screen, esports, controller, cooking, beauty, desk, office, pajamas',
    cinemaStyle: 'Dynamic action, dramatic lighting, slow motion on impact moments, wide stadium shots, intense close-ups',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Preparation → Competition → Victory',
    environmentInclude: 'Stadium field with markings, basketball court hardwood, swimming pool lanes, running track with starting blocks, locker room bench, trophy display, sideline bench, scoreboard',
    environmentExclude: 'Gaming PC setup, esports arena, cooking competition, beauty pageant, office meeting, dance studio',
  },

  'recovery-relaxation': {
    name: 'Recovery & Relaxation',
    key: 'recovery-relaxation',
    triggerKeywords: ['recovery', 'relaxation', 'stretch', 'foam roller', 'massage', 'ice bath', 'sauna', 'rest day', 'sleep', 'yoga', 'breathing', 'cooldown', 'wind down', 'self care routine'],
    negativeKeywords: ['extreme workout', 'hiit', 'heavy lifting', 'sprint', 'competition'],
    imagePromptPrefix: 'Calm recovery environment. Yoga mat, foam roller, candles, bath, cozy blanket, nature. Person in restful or gentle stretching position.',
    videoPromptPrefix: 'Slow gentle recovery movement. Stretching, rolling, deep breathing, lying in sauna, soaking. Unhurried and restorative.',
    negativePrompt: 'intense workout, heavy weights, sprinting, screaming, competition, aggressive, loud, chaotic gym',
    cinemaStyle: 'Soft warm, candle and natural light, very slow camera, muted peaceful tones, meditative pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Tension → Release → Restoration',
    environmentInclude: 'Foam roller on yoga mat, bath with candles, sauna wooden bench, ice bath tub, hammock in garden, stretching on grass, warm compress on shoulder, sleep mask on nightstand, weighted blanket',
    environmentExclude: 'Heavy weights, sprint track, boxing ring, loud concert, high-intensity gym, competition stage, crowded bar',
  },

  kindness: {
    name: 'Random Acts of Kindness',
    key: 'kindness',
    triggerKeywords: ['kindness', 'random act', 'pay it forward', 'helping', 'charity', 'donation', 'surprise', 'giving', 'volunteer', 'community', 'generous', 'good deed', 'heartwarming'],
    negativeKeywords: ['scam', 'exploitation', 'guilt trip', 'forced'],
    imagePromptPrefix: 'Everyday public or community setting. Street, store, park, shelter. Person doing something kind for another — giving, helping, surprising.',
    videoPromptPrefix: 'Warm spontaneous movement. Handing something to someone, helping carry bags, surprising with gift, hugging. Real unscripted feel.',
    negativePrompt: 'staged, fake, exploitative, filming for clout, mocking, scam, forced crying, manipulation',
    cinemaStyle: 'Warm heartfelt, natural daylight, candid documentary feel, focus on reactions, gentle emotional pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Setup → Act → Reaction',
    environmentInclude: 'Street sidewalk handoff, grocery store helping elderly, park bench sharing food, shelter volunteer line, surprise gift wrapping, hospital bedside visit, community garden helping, school classroom sharing',
    environmentExclude: 'Staged studio, camera crew visible, forced tears, exploitation setup, brand logos prominent, scripted acting, mockery',
  },

  psychology: {
    name: 'Psychology',
    key: 'psychology',
    triggerKeywords: ['psychology', 'psychological', 'behavior', 'cognitive', 'subconscious', 'manipulation', 'persuasion', 'body language', 'attachment style', 'narcissist', 'gaslighting', 'dark psychology', 'stoic', 'stoicism', 'emotional intelligence'],
    negativeKeywords: ['gaming', 'cooking', 'fashion', 'beauty'],
    imagePromptPrefix: 'Thoughtful intellectual setting. Person in contemplation, library, quiet office, park bench thinking. Or two people in conversation showing body language dynamics.',
    videoPromptPrefix: 'Subtle psychological movement. Facial micro-expressions, eye contact shifts, posture changes, mirroring. Body language tells the story.',
    negativePrompt: 'gaming, cooking, fashion runway, beauty counter, gym, sports field, concert, loud party',
    cinemaStyle: 'Moody contemplative, shadow and light contrast, close-ups on eyes and hands, intellectual pacing',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Observation → Analysis → Insight',
    environmentInclude: 'Two people in conversation showing body language, therapy office with two chairs, person alone thinking on park bench, mirror reflection, crowd with one person isolated, eyes in extreme close-up, hands gesturing during conversation',
    environmentExclude: 'Gaming setup, cooking show, fashion runway, gym floor, concert stage, beauty counter, sports arena',
  },

  '3d-animation': {
    name: '3D Animation',
    key: '3d-animation',
    triggerKeywords: ['3d animation', '3d render', 'blender', 'maya', 'cgi', '3d model', 'animated 3d', '3d character', 'unreal engine', 'cinema 4d', 'motion graphics 3d', 'zbrush'],
    negativeKeywords: ['cosplay', 'costume', 'dress up', 'halloween', 'roleplay', 'anime cosplay', 'live action real person'],
    imagePromptPrefix: '3D rendered environment. Stylised or photorealistic CGI scene. Digital character or object as hero. Clean studio or fantasy environment.',
    videoPromptPrefix: '3D animation movement. Smooth rigged character motion, camera orbit around subject, physics simulation. Digital not live action.',
    negativePrompt: 'cosplay, costume, dress up, real person in costume, halloween, live action, photograph, documentary, handheld phone camera',
    cinemaStyle: 'Clean 3D render, studio lighting on digital subject, smooth orbital camera, professional CGI quality',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'World build → Story → Climax',
    environmentInclude: 'Clean 3D rendered environment, studio lighting on digital subject, geometric shapes, polygon mesh visible, stylised landscape, digital character on pedestal, Blender/Maya viewport feel',
    environmentExclude: 'Real person in costume, cosplay outfit, Halloween dress-up, live-action photography, handheld camera shake, documentary grain, real human skin texture',
  },

  vfx: {
    name: 'Visual Effects for Film & TV',
    key: 'vfx',
    triggerKeywords: ['vfx', 'visual effects', 'cgi breakdown', 'movie effects', 'film vfx', 'special effects', 'compositing', 'rotoscope', 'green screen', 'matte painting', 'particle effects'],
    negativeKeywords: ['cosplay', 'amateur video', 'tiktok dance', 'cooking'],
    imagePromptPrefix: 'High-production VFX environment. Before/after breakdown, green screen set, composited scene, particle effects, matte painting background.',
    videoPromptPrefix: 'VFX showcase movement. Camera reveal of effect, before/after wipe, element appearing or transforming. Production-grade visual.',
    negativePrompt: 'amateur, low quality, phone video, cosplay, cooking, daily vlog, selfie, bathroom mirror',
    cinemaStyle: 'Cinematic epic, dramatic lighting, high production value, theatrical scale, professional grade',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Behind scenes → Final shot → Wow',
    environmentInclude: 'Green screen set with markers, before/after split screen, particle effect explosion, matte painting landscape, compositing layers visible, motion capture suit, film set with camera rig',
    environmentExclude: 'Amateur phone video, selfie bathroom mirror, cooking vlog, daily routine, low production casual content, TikTok dance',
  },

  'medical-animation': {
    name: 'Medical & Scientific Animation',
    key: 'medical-animation',
    triggerKeywords: ['medical animation', 'scientific visualization', 'anatomy', 'biology animation', 'molecular', 'cell', 'organ', 'surgical', 'pharmaceutical', 'medical illustration', 'x-ray', 'mri'],
    negativeKeywords: ['gore', 'graphic surgery', 'horror', 'zombie', 'blood splatter'],
    imagePromptPrefix: 'Clean scientific/medical environment. Anatomical model, molecular structure, clean lab, educational diagram. Clinical precision.',
    videoPromptPrefix: 'Precise scientific movement. Cell dividing, molecule rotating, organ system animation, data flowing. Educational and accurate.',
    negativePrompt: 'gore, horror, blood splatter, zombie, monster, dark fantasy, dirty, messy, amateur, scary',
    cinemaStyle: 'Clean clinical, blue-white lighting, precise camera movement, educational clarity, professional medical grade',
    defaultDuration: 10,
    lightningModeDefault: false,
    eraDetection: false,
    emotionalArc: 'Question → Explanation → Understanding',
    environmentInclude: 'Clean molecular structure floating, cell cross-section diagram, anatomical model in white space, organ system with labels area, clean lab with microscope, DNA helix rotation, surgical tool layout on sterile tray',
    environmentExclude: 'Gore, blood splatter, horror anatomy, zombie, monster, dark fantasy creature, dirty operating room, amateur dissection',
  },

  'vr-ar': {
    name: 'Virtual Reality & Augmented Reality',
    key: 'vr-ar',
    triggerKeywords: ['vr', 'virtual reality', 'ar', 'augmented reality', 'immersive', 'metaverse', 'headset', 'spatial computing', 'mixed reality', 'apple vision', 'quest', 'hologram'],
    negativeKeywords: ['cooking', 'beauty', 'fashion', 'gardening', 'pet'],
    imagePromptPrefix: 'Futuristic immersive environment. Person wearing VR headset, holographic interfaces, augmented overlays on real world, digital environments.',
    videoPromptPrefix: 'Immersive interactive movement. Person reaching into virtual space, interacting with holograms, navigating digital world. Seamless real-digital blend.',
    negativePrompt: 'cooking, beauty, garden, pet, medieval, historical, handwritten, rustic, farmhouse, analog',
    cinemaStyle: 'Futuristic, holographic blue-purple tones, dynamic POV camera, seamless transitions between real and digital',
    defaultDuration: 8,
    lightningModeDefault: true,
    eraDetection: false,
    emotionalArc: 'Real world → Immersive experience → Transformation',
    environmentInclude: 'Person wearing VR headset reaching into space, holographic UI panels floating, augmented overlay on real room, digital world environment with grid floor, mixed reality hand interaction, headset reflection showing virtual content',
    environmentExclude: 'Cooking kitchen, pet walking, garden planting, historical setting, candlelit room, rustic cabin, no-technology environment',
  },

};

// ── Legacy alias for backwards compatibility ───────────────────────────────────
// Any code still referencing NICHE_HIDDEN_SETTINGS gets the new config.
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
