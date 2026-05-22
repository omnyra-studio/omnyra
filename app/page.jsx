"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Play,
  Download,
  ArrowRight,
  Star,
  Check,
} from "lucide-react";

const STEPS = [
  {
    n: "01",
    Icon: Sparkles,
    title: "Describe your video",
    desc: "Tell Omnyra your product, audience, and vibe. No prompt engineering.",
  },
  {
    n: "02",
    Icon: Play,
    title: "Preview in Draft Mode",
    desc: "See your video concept in seconds before committing credits.",
  },
  {
    n: "03",
    Icon: Download,
    title: "Render in studio quality",
    desc: "Full cinematic render with motion, voice, and lip sync.",
  },
];

const OUTCOME_PILLS = [
  { emoji: "🎬", label: "Viral UGC Ads" },
  { emoji: "📱", label: "TikTok Storytime" },
  { emoji: "👤", label: "AI Influencer Clips" },
  { emoji: "🛍️", label: "Product Launch Reels" },
  { emoji: "😶", label: "Faceless Content" },
];

const AVATAR_GRADIENTS = [
  "from-violet-300 to-violet-500",
  "from-cyan-200 to-sky-400",
  "from-pink-200 to-rose-400",
  "from-blue-200 to-indigo-400",
  "from-white to-slate-200",
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Try the magic",
    credits: "50 credits / month",
    href: "/signup",
    features: [
      "5 script generations / day",
      "3 voice previews / week",
      "1 watermarked render / month",
      "Unlimited draft previews",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Creator",
    price: "$29",
    period: "/ month AUD",
    tagline: "Post occasionally",
    credits: "200 credits / month",
    href: "/signup?plan=creator",
    features: [
      "25 scripts / month",
      "15 voice generations / month",
      "6 final renders · no watermark",
      "720p exports",
    ],
    cta: "Choose Creator",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$69",
    period: "/ month AUD",
    tagline: "Post consistently",
    credits: "500 credits / month",
    href: "/signup?plan=pro",
    features: [
      "Unlimited scripts",
      "50 voice generations / month",
      "20 final renders · no watermark",
      "1080p · priority queue",
    ],
    cta: "Choose Pro",
    highlight: true,
  },
  {
    name: "Studio",
    price: "$99",
    period: "/ month AUD",
    tagline: "Go full creator",
    credits: "1,500 credits / month",
    href: "/signup?plan=studio",
    features: [
      "Everything in Pro",
      "150 voice generations / month",
      "50 final renders · 4K",
      "Voice cloning · Studio Mode",
    ],
    cta: "Choose Studio",
    highlight: false,
  },
];

export default function Landing() {
  const router = useRouter();

  function scrollToHow() {
    document
      .getElementById("how-it-works")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-white text-slate-900">
      {/* LIGHT LUXURY BACKGROUND SYSTEM */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/4 w-[800px] h-[800px] rounded-full blur-[120px] bg-violet-500/10" />
        <div className="absolute top-1/2 -right-32 w-[700px] h-[700px] rounded-full blur-[120px] bg-sky-400/[0.08]" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-[120px] bg-violet-300/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0)_0%,rgba(248,250,252,0.6)_70%,#FFFFFF_100%)]" />
      </div>

      {/* NAV */}
      <nav className="sticky top-0 z-40 backdrop-blur-2xl bg-white/70 border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img
              src="/logo-nav.png"
              alt="Omnyra AI"
              className="h-12 lg:h-20 w-auto object-contain"
            />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            <a href="#how-it-works" className="hover:text-violet-600 transition-colors">
              How it works
            </a>
            <a href="#outcomes" className="hover:text-violet-600 transition-colors">
              What you make
            </a>
            <a href="#pricing" className="hover:text-violet-600 transition-colors">
              Pricing
            </a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/signin")}
              className="hidden sm:inline-block text-sm text-slate-600 hover:text-violet-600 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => router.push("/signup")}
              className="px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-[0_8px_24px_rgba(139,92,246,0.25)] transition-all"
            >
              Get started free
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-16 lg:pt-24 pb-20 lg:pb-28">
        <div className="max-w-4xl mx-auto px-6 text-center">
          {/* Original Omnyra logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo-hero.png"
              alt="Omnyra"
              className="h-14 md:h-16 w-auto object-contain"
            />
          </div>

          {/* Headline */}
          <div className="space-y-2">
            <h1 className="text-5xl md:text-7xl font-black tracking-tight text-slate-900 leading-[1.05]">
              Your content looks AI-generated.
            </h1>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight text-violet-500 leading-[1.05]">
              Omnyra fixes that.
            </h1>
          </div>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-slate-600 max-w-xl mx-auto mt-6 leading-relaxed">
            Create emotionally realistic AI videos in minutes. Cinematic motion.
            Human pacing. Built to stop the scroll.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-8 py-4 rounded-2xl font-semibold shadow-[0_10px_40px_rgba(139,92,246,0.25)] transition-all hover:shadow-[0_14px_50px_rgba(139,92,246,0.35)] hover:-translate-y-0.5"
            >
              Create my first video free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={scrollToHow}
              className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white/70 backdrop-blur text-slate-700 hover:border-violet-300 hover:text-violet-600 px-8 py-4 rounded-2xl font-semibold transition-all"
            >
              See how it works
            </button>
          </div>

          {/* Trust line */}
          <p className="text-sm text-slate-500 mt-4">
            No credit card required · 50 free credits · Cancel anytime
          </p>

          {/* Social proof */}
          <div className="mt-12 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="flex">
                {AVATAR_GRADIENTS.map((g, i) => (
                  <div
                    key={i}
                    className={[
                      "w-9 h-9 rounded-full bg-gradient-to-br shadow-[0_4px_12px_rgba(15,23,42,0.08)] ring-2 ring-white",
                      g,
                      i > 0 ? "-ml-2" : "",
                    ].join(" ")}
                  />
                ))}
              </div>
              <div className="flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Join 2,400+ creators already using Omnyra
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="relative scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 text-center mt-24 tracking-tight">
            Three steps. One video.
          </h2>
          <p className="text-slate-500 text-center mt-3 max-w-xl mx-auto">
            From a sentence to a polished render — without leaving Omnyra.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {STEPS.map(({ n, Icon, title, desc }) => (
              <div
                key={n}
                className="group bg-white/80 backdrop-blur border border-slate-200 rounded-2xl p-6 hover:border-violet-300/70 hover:shadow-[0_20px_60px_-30px_rgba(139,92,246,0.35)] hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="w-10 h-10 rounded-full border border-violet-200 bg-white flex items-center justify-center text-xs font-bold text-violet-500 tracking-wider">
                    {n}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OUTCOME STRIP */}
      <section id="outcomes" className="relative pt-24 pb-4">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            What creators make with Omnyra
          </h2>
          <p className="text-slate-500 mt-3 max-w-xl mx-auto">
            Pick an outcome, hit create. Omnyra handles the rest.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
            {OUTCOME_PILLS.map(({ emoji, label }) => (
              <Link
                key={label}
                href={`/create?template=${label.toLowerCase().replace(/\s+/g, "-")}`}
                className="inline-flex items-center gap-2 bg-violet-50 text-violet-600 border border-violet-200 rounded-full px-5 py-2.5 text-sm font-medium hover:bg-violet-100 hover:border-violet-300 transition-all"
              >
                <span className="text-base leading-none" aria-hidden>
                  {emoji}
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight">
              Start free. Scale when you&apos;re ready.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Scripts and drafts are always free on every plan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={[
                  "relative rounded-3xl p-7 flex flex-col transition-all duration-300",
                  plan.highlight
                    ? "bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-[0_30px_80px_-30px_rgba(139,92,246,0.5)] -translate-y-2"
                    : "bg-white/80 backdrop-blur border border-slate-200 text-slate-900 shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]",
                ].join(" ")}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-violet-600 text-[10px] uppercase tracking-[0.2em] font-bold shadow-md">
                    Most loved
                  </div>
                )}

                <div className="mb-1 text-[11px] uppercase tracking-[0.25em] opacity-70">
                  {plan.name}
                </div>
                <div
                  className={[
                    "text-xs mb-6",
                    plan.highlight ? "text-white/70" : "text-slate-500",
                  ].join(" ")}
                >
                  {plan.tagline}
                </div>

                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-5xl font-bold tracking-tight">
                    {plan.price}
                  </span>
                  <span
                    className={[
                      "text-sm",
                      plan.highlight ? "text-white/70" : "text-slate-500",
                    ].join(" ")}
                  >
                    {plan.period}
                  </span>
                </div>
                <div
                  className={[
                    "inline-flex items-center gap-1.5 self-start text-base font-bold rounded-full px-3 py-1 mb-7",
                    plan.highlight
                      ? "bg-white/15 text-white ring-1 ring-white/30"
                      : "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                  ].join(" ")}
                >
                  {plan.credits}
                </div>

                <ul className="space-y-3 flex-1 mb-7">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className={[
                        "flex items-start gap-2.5 text-sm",
                        plan.highlight ? "text-white/90" : "text-slate-700",
                      ].join(" ")}
                    >
                      <Check
                        className={[
                          "w-4 h-4 mt-0.5 flex-shrink-0",
                          plan.highlight ? "text-white" : "text-violet-500",
                        ].join(" ")}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => router.push(plan.href)}
                  className={[
                    "w-full py-3 rounded-full font-semibold text-sm transition-all",
                    plan.highlight
                      ? "bg-white text-violet-600 hover:bg-slate-50"
                      : "bg-slate-900 text-white hover:bg-violet-600",
                  ].join(" ")}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative py-24 lg:py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
            Your first scene is{" "}
            <span className="text-violet-500">one breath away.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-600 max-w-xl mx-auto">
            Open Omnyra. Type a feeling. Watch a video happen.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-8 py-4 rounded-2xl font-semibold shadow-[0_10px_40px_rgba(139,92,246,0.25)] transition-all hover:shadow-[0_14px_50px_rgba(139,92,246,0.35)] hover:-translate-y-0.5"
            >
              Create my first video free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="mt-5 text-sm text-slate-500">
            50 free credits · No credit card · Cancel anytime
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200/70 pt-14 pb-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block mb-4">
              <img
                src="/logo-nav.png"
                alt="Omnyra AI"
                className="h-7 w-auto object-contain"
              />
            </Link>
            <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
              An AI content direction studio for the next generation of creators.
            </p>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400 mb-4 font-semibold">
              Product
            </div>
            <div className="space-y-2.5 text-sm text-slate-600">
              <a href="#how-it-works" className="block hover:text-violet-600">
                How it works
              </a>
              <a href="#outcomes" className="block hover:text-violet-600">
                What you make
              </a>
              <a href="#pricing" className="block hover:text-violet-600">
                Pricing
              </a>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400 mb-4 font-semibold">
              Get started
            </div>
            <div className="space-y-2.5 text-sm text-slate-600">
              <Link href="/signup" className="block hover:text-violet-600">
                Sign up free
              </Link>
              <Link href="/signin" className="block hover:text-violet-600">
                Sign in
              </Link>
              <Link href="/dashboard" className="block hover:text-violet-600">
                Dashboard
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-10 mt-12 pt-8 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            © 2026 Omnyra AI. Directed in Sydney.
          </p>
          <div className="flex gap-5 text-xs text-slate-400">
            <a href="#" className="hover:text-violet-600">
              Privacy
            </a>
            <a href="#" className="hover:text-violet-600">
              Terms
            </a>
            <a href="#" className="hover:text-violet-600">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
