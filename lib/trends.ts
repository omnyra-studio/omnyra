export const nicheTrends: Record<string, { hooks: string[]; topics: string[] }> = {
  "Fitness": {
    hooks: ["Day 1 vs Day 30", "5 minute workout", "glow up challenge"],
    topics: ["home workouts", "abs", "strength training", "mobility"],
  },
  "Personal Finance & Side Hustles": {
    hooks: ["Made $X with $0", "This side hustle changed my life", "Avoid this mistake"],
    topics: ["passive income", "faceless", "dropshipping", "AI side hustle"],
  },
  "Motivation": {
    hooks: ["The harsh truth", "Never give up", "Discipline = freedom"],
    topics: ["morning routine", "mindset", "success habits"],
  },
  "Luxury · High-End Living": {
    hooks: ["POV: Living like this", "Millionaire morning"],
    topics: ["luxury homes", "designer lifestyle", "private jet"],
  },
  "Technology & AI Innovations": {
    hooks: ["This AI changes everything", "New tool just dropped"],
    topics: ["Grok 4", "new AI model", "automation"],
  },
  "Mental Health & Mindfulness": {
    hooks: ["You're not alone", "One thing that helped me"],
    topics: ["anxiety tips", "meditation", "journaling"],
  },
  "Relationships & Love": {
    hooks: ["The sign they're the one", "Red flag vs green flag"],
    topics: ["dating advice", "couple goals", "breakup recovery"],
  },
  "History · True Stories · Documentary": {
    hooks: ["The forgotten story of...", "What they don't teach in school"],
    topics: ["WWII secrets", "untold history", "D-Day"],
  },
  "Beauty · Skincare · Makeup": {
    hooks: ["This changed my skin", "5 minute glow up"],
    topics: ["glass skin", "Korean skincare", "makeup hacks"],
  },
  "Productivity & Time Management": {
    hooks: ["Do this instead of scrolling", "Productivity hack"],
    topics: ["deep work", "notion setup", "time blocking"],
  },
  "Business · Entrepreneurship": {
    hooks: ["How I built $X business", "Lessons from failure"],
    topics: ["scaling", "marketing", "first $10k"],
  },
  "Pet Care & Animals": {
    hooks: ["Every pet owner needs this", "Cute + useful"],
    topics: ["dog training", "cat hacks", "pet DIY"],
  },
  "Teens & Teen Life": {
    hooks: ["POV: School", "Relatable teen struggle"],
    topics: ["school life", "friend drama", "teen trends"],
  },
  "Food · Recipes · Cooking": {
    hooks: ["5 minute recipe", "Viral food hack"],
    topics: ["easy dinner", "healthy snacks", "air fryer recipes"],
  },
  "DIY + Money Saving Hacks/Tricks": {
    hooks: ["Save $X with this", "5 minute DIY"],
    topics: ["home hacks", "budget fixes", "upcycling"],
  },
};

export function getTrendingHook(niche: string): string {
  const data = nicheTrends[niche];
  if (!data || data.hooks.length === 0) return "This will change your life";
  return data.hooks[Math.floor(Math.random() * data.hooks.length)];
}

export function getTrendingTopics(niche: string, count = 3): string[] {
  const data = nicheTrends[niche];
  if (!data) return [];
  return data.topics.slice(0, count);
}
