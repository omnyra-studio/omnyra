export const metadata = { title: "FAQ — Omnyra" };

interface FAQItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    q: "What is Omnyra?",
    a: "Omnyra is an AI-powered content strategy platform that helps creators and brands generate short-form video hooks, strategies, and creative frameworks. It uses predictive modeling to score and rank content ideas based on retention, virality, and platform fit.",
  },
  {
    q: "How does Omnyra generate hooks?",
    a: "You enter a topic or content idea. Omnyra classifies it into a niche, then generates exactly 6 hook variants — each using a different psychological strategy (curiosity gap, shock reversal, emotional confession, authority insight, relatable frustration, unexpected twist). Each variant is scored and ranked. You select the one that best fits your goals.",
  },
  {
    q: "Why exactly 6 hooks?",
    a: "Six variants ensures diversity across all major psychological engagement triggers without creating decision fatigue. Each variant uses a distinct strategy — no two hooks are structurally or emotionally similar.",
  },
  {
    q: "Can I get more than 6 hooks?",
    a: "No. The system is designed around exactly 6 variants per session. This is a deliberate constraint to maintain quality and strategic differentiation across all outputs.",
  },
  {
    q: "Does Omnyra pick the best option automatically?",
    a: "Omnyra recommends the highest-scoring variant based on its scoring formula. However, the final selection is always yours. The recommendation is advisory — you are never locked into a choice.",
  },
  {
    q: "How accurate are the scores?",
    a: "Scores are heuristic estimates based on predictive modeling of engagement patterns. They are directional indicators, not guarantees. Actual performance depends on platform algorithms, timing, audience, and many external factors outside Omnyra's control.",
  },
  {
    q: "Can I override the recommendation?",
    a: "Yes. You can select any of the 6 variants regardless of the recommendation. You can also request a remix or provide refined input to regenerate the strategy.",
  },
  {
    q: "Is virality guaranteed?",
    a: "No. Virality is not guaranteed — outputs only increase the likelihood of performance based on predictive modeling. Omnyra improves the probabilistic conditions for content to perform well. It does not control platform algorithms or audience behavior.",
  },
  {
    q: "What platforms does Omnyra support?",
    a: "Omnyra is optimized for TikTok, Instagram Reels, YouTube Shorts, and YouTube long-form. Platform fit scores are calculated per variant based on the dominant engagement dynamics of each platform.",
  },
  {
    q: "What is the scoring formula?",
    a: "Final score = (Retention × 0.4) + (Virality × 0.3) + (Platform Fit × 0.2) + (Clarity × 0.1). This formula weights watch retention as the primary driver of algorithmic performance, followed by virality potential and platform alignment.",
  },
  {
    q: "Who is responsible for published content?",
    a: "You are. Omnyra generates suggestions. You are responsible for reviewing, editing, and publishing all content. Omnyra does not publish content on your behalf.",
  },
  {
    q: "What if I get weak or repetitive hooks?",
    a: "Refine your input. The more specific your topic, niche, and target audience, the more differentiated and accurate the outputs will be. Vague topics produce generic results.",
  },
  {
    q: "How do I contact support?",
    a: "Email us at info@omnyra.studio for support or billing inquiries.",
  },
];

export default function FAQPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-sm text-gray-200 leading-relaxed">
      <h1 className="text-2xl font-bold text-white mb-2">Frequently Asked Questions</h1>
      <p className="text-gray-400 mb-10">
        Everything you need to know about how Omnyra works.
      </p>

      <div className="space-y-8">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="border-b border-white/10 pb-6">
            <h2 className="font-semibold text-white mb-2">{item.q}</h2>
            <p className="text-gray-300">{item.a}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 border border-yellow-500/30 rounded-lg p-5 bg-yellow-500/5">
        <p className="text-yellow-300 font-medium mb-1">Performance Disclaimer</p>
        <p className="text-gray-400">
          Virality is not guaranteed — outputs only increase the likelihood of performance based on
          predictive modeling. All scores and recommendations are estimates. Actual results depend on
          platform algorithms, audience behavior, timing, and external factors outside of Omnyra&apos;s
          control. Past predicted performance does not indicate future results.
        </p>
      </div>
    </main>
  );
}
