"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Mic,
  AudioWaveform,
  Image as ImageIcon,
  Clapperboard,
  UserSquare,
  Video,
  Bookmark,
  Search,
  Hash,
  Lock,
  ArrowRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

const TOOLS = [
  {
    href: "/studio/script",
    title: "Script Studio",
    desc: "Write and refine scripts manually",
    Icon: FileText,
  },
  {
    href: "/studio/voice",
    title: "Voice Studio",
    desc: "Browse and preview 1000+ ElevenLabs voices",
    Icon: Mic,
  },
  {
    href: "/studio/voice-clone",
    title: "Voice Clone",
    desc: "Clone any voice from 30 seconds of audio",
    Icon: AudioWaveform,
  },
  {
    href: "/studio/image",
    title: "Image Studio",
    desc: "Generate images with Flux and FAL",
    Icon: ImageIcon,
  },
  {
    href: "/studio/motion",
    title: "Motion Studio",
    desc: "Animate images with Kling, Runway, Pika",
    Icon: Clapperboard,
  },
  {
    href: "/studio/presenter",
    title: "Presenter Studio",
    desc: "HeyGen and D-ID avatar generation",
    Icon: UserSquare,
  },
  {
    href: "/studio/lipsync",
    title: "Lip Sync Studio",
    desc: "Sync any audio to any video face",
    Icon: Video,
  },
  {
    href: "/studio/brand",
    title: "Brand Memory",
    desc: "Save your brand voice, colors, audience",
    Icon: Bookmark,
  },
  {
    href: "/studio/research",
    title: "Research Studio",
    desc: "Deep research with Claude AI",
    Icon: Search,
  },
  {
    href: "/studio/captions",
    title: "Captions & Tags",
    desc: "Generate captions and hashtags",
    Icon: Hash,
  },
];

const UNLOCKED_PLANS = new Set(["pro", "studio"]);

function ToolCard({ tool, locked }) {
  const { Icon, title, desc, href } = tool;

  const inner = (
    <>
      <div className="flex items-start justify-between mb-8">
        <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-violet-300" />
        </div>
        {!locked && (
          <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-violet-300 group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
      <h3 className="text-base font-semibold text-white tracking-tight mb-1.5">
        {title}
      </h3>
      <p className="text-xs text-white/40 leading-relaxed">{desc}</p>
    </>
  );

  const cardClasses = [
    "group relative h-full rounded-xl border bg-white/3 p-6 transition-all duration-200 overflow-hidden",
    locked
      ? "border-white/10 opacity-40"
      : "border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-[0_0_40px_-12px_rgba(139,92,246,0.5)] hover:-translate-y-0.5 shadow-violet-500/0 hover:shadow-violet-500/30",
  ].join(" ");

  if (locked) {
    return (
      <div className={cardClasses}>
        {inner}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl p-4 text-center">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Lock className="w-4 h-4 text-white/70" />
          </div>
          <p className="text-xs text-white/80 font-medium mb-4 max-w-[180px] leading-snug">
            Upgrade to Pro to unlock Studio Mode
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium shadow-[0_0_20px_-4px_rgba(139,92,246,0.6)] transition-colors"
          >
            Upgrade
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link href={href} className={cardClasses}>
      {inner}
    </Link>
  );
}

function NavLink({ href, label, active, subtle }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full font-medium transition-colors",
        subtle ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        active
          ? "text-white bg-white/8"
          : "text-white/55 hover:text-white hover:bg-white/5",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/signin");
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", session.user.id)
          .single();

        if (cancelled) return;
        setPlan(profile?.plan || "free");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const unlocked = UNLOCKED_PLANS.has(plan);

  return (
    <div className="min-h-screen bg-[#070710] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/8 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070710]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 lg:gap-4">
            <div className="w-12 h-12 lg:w-20 lg:h-20 rounded-xl lg:rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
              <Sparkles className="w-6 h-6 lg:w-10 lg:h-10 text-white" />
            </div>
            <span className="gold-text text-lg lg:text-3xl font-semibold tracking-tight">Omnyra</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/create" label="Create" />
            <NavLink href="/dashboard#videos" label="My Videos" />
            <NavLink href="/studio" label="Studio" active subtle />
            <NavLink href="/dashboard/settings" label="Account" />
          </nav>

          <Link
            href="/dashboard"
            className="text-xs text-white/45 hover:text-white/80 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <section className="mb-12">
          <nav
            aria-label="Breadcrumb"
            className="text-xs text-white/35 flex items-center gap-1.5 mb-6"
          >
            <Link href="/dashboard" className="hover:text-white/70 transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/60">Studio Mode</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="text-[11px] uppercase tracking-[0.2em] text-violet-300 font-medium">
                  Pro &amp; Studio plan
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-white">
                Studio Mode
              </h1>
              <p className="mt-3 text-sm md:text-base text-white/55 max-w-xl">
                Full control over every layer of your content.
              </p>
            </div>

            {!loading && (
              <div className="text-xs text-white/40">
                Plan:{" "}
                <span
                  className={[
                    "ml-1 font-medium capitalize",
                    unlocked ? "text-violet-300" : "text-amber-300",
                  ].join(" ")}
                >
                  {plan}
                </span>
              </div>
            )}
          </div>
        </section>

        {!unlocked && !loading && (
          <div className="mb-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Studio Mode is for Pro &amp; Studio plans
                </p>
                <p className="text-xs text-white/50 mt-0.5">
                  Unlock individual tools, voice cloning, and advanced controls.
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium shadow-[0_0_24px_-6px_rgba(139,92,246,0.6)] transition-colors self-start sm:self-auto"
            >
              Upgrade
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.href} tool={tool} locked={!unlocked || loading} />
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-white/5 pt-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-white/60">Looking for the simple flow?</p>
              <p className="text-xs text-white/35 mt-1">
                The outcome-first home is built for fast creation.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/12 text-white/75 hover:text-white hover:border-white/25 hover:bg-white/5 text-sm font-medium transition-colors self-start sm:self-auto"
            >
              Back to Home
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
