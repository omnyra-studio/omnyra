"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Film,
  Smartphone,
  UserCircle2,
  ShoppingBag,
  EyeOff,
  Download,
  Play,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

const OUTCOMES = [
  {
    id: "ugc-ad",
    icon: Film,
    emoji: "🎬",
    title: "Viral UGC Ad",
    desc: "Product → hook → motion → download. 60 seconds.",
  },
  {
    id: "storytime",
    icon: Smartphone,
    emoji: "📱",
    title: "TikTok Storytime",
    desc: "Narrative arc. Tension. Payoff. Built to retain.",
  },
  {
    id: "influencer",
    icon: UserCircle2,
    emoji: "👤",
    title: "AI Influencer Clip",
    desc: "Your AI persona. Any scene. Any vibe.",
  },
  {
    id: "product-launch",
    icon: ShoppingBag,
    emoji: "🛍️",
    title: "Product Launch Reel",
    desc: "Turn product into cinematic social content.",
  },
  {
    id: "faceless",
    icon: EyeOff,
    emoji: "😶",
    title: "Faceless Content",
    desc: "Voice + visuals. No face required.",
  },
];

function getGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function deriveFirstName(user) {
  if (!user) return "there";
  const meta = user.user_metadata || {};
  const candidates = [meta.first_name, meta.full_name, meta.name, user.email].filter(Boolean);
  const raw = candidates[0] || "there";
  const first = String(raw).split(/[\s@.]/)[0];
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const day = 86400000;
  if (diffMs < day && d.getDate() === now.getDate()) return "Today";
  if (diffMs < day * 2) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NavLink({ href, label, active }) {
  return (
    <Link
      href={href}
      className={[
        "px-4 py-2 rounded-full text-sm font-medium transition-colors",
        active
          ? "text-[var(--text-primary)] bg-[var(--border-subtle)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(212,168,67,0.06)]",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function OutcomeCard({ outcome }) {
  return (
    <Link
      href={`/create?template=${outcome.id}`}
      className="group relative flex flex-col justify-between p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[rgba(212,168,67,0.45)] hover:bg-[rgba(212,168,67,0.04)] hover:shadow-[0_0_40px_-12px_rgba(212,168,67,0.25)] transition-all duration-200 min-h-[200px] overflow-hidden"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[var(--glow-gold)] blur-3xl" />
      </div>

      <div className="relative">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[rgba(212,168,67,0.1)] border border-[rgba(212,168,67,0.2)] mb-4 text-2xl">
          <span aria-hidden>{outcome.emoji}</span>
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          {outcome.title}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{outcome.desc}</p>
      </div>

      <div className="relative mt-6 flex items-center gap-1.5 text-[var(--accent-gold)] text-sm font-medium">
        <span>Create</span>
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function RenderCard({ render }) {
  const complete = render.status === "complete" || render.status === "completed";
  const processing = render.status === "processing" || render.status === "pending";

  return (
    <div className="group rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[rgba(212,168,67,0.25)] overflow-hidden transition-colors">
      <div className="relative aspect-video bg-gradient-to-br from-[#1A0E1C] via-[#231525] to-[#1A0E1C] flex items-center justify-center overflow-hidden">
        {render.video_url ? (
          <video
            src={render.video_url}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <Sparkles className="w-8 h-8 text-[var(--text-secondary)]/30" />
        )}
        <div className="absolute top-3 left-3">
          {complete && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-[rgba(78,203,140,0.15)] border border-[rgba(78,203,140,0.3)] text-[#4ECB8C] font-medium">
              Complete
            </span>
          )}
          {processing && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-[rgba(212,168,67,0.15)] border border-[rgba(212,168,67,0.3)] text-[var(--accent-gold)] font-medium">
              Processing
            </span>
          )}
          {!complete && !processing && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-[rgba(212,168,67,0.08)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium capitalize">
              {render.status || "Draft"}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex items-center justify-between gap-3">
        <div className="text-xs text-[var(--text-secondary)]">{formatDate(render.created_at)}</div>
        <div className="flex items-center gap-2">
          {complete && render.video_url && (
            <a
              href={render.video_url}
              download
              className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-[rgba(212,168,67,0.08)] border border-[var(--border-subtle)] hover:bg-[rgba(212,168,67,0.15)] text-[var(--text-secondary)]"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          )}
          <Link
            href={`/dashboard/creator?render=${render.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-[rgba(212,168,67,0.15)] border border-[rgba(212,168,67,0.3)] text-[var(--accent-gold)] hover:bg-[rgba(212,168,67,0.25)]"
          >
            <Play className="w-3.5 h-3.5" />
            View
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [renders, setRenders] = useState([]);
  const [greeting, setGreeting] = useState(getGreeting());

  useEffect(() => {
    const t = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/signin");
          return;
        }
        if (cancelled) return;
        setUser(session.user);

        const [creditsRes, rendersRes] = await Promise.all([
          supabase
            .from("credits")
            .select("balance")
            .eq("user_id", session.user.id)
            .single(),
          supabase
            .from("renders")
            .select("id, video_url, status, created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(4),
        ]);

        if (cancelled) return;
        setCredits(creditsRes.data?.balance ?? 0);
        setRenders(rendersRes.data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  const firstName = deriveFirstName(user);
  const lowCredits = credits < 20;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/signin");
  }

  return (
    <div className="min-h-screen">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[var(--accent-gold)]/[0.07] blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-[var(--accent-rose)]/[0.06] blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-[#2D1030]/80 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--bg-primary)]/75 border-b border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 lg:gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-[var(--accent-gold)] to-[var(--accent-rose)] flex items-center justify-center shadow-[0_0_20px_rgba(212,168,67,0.3)]">
              <Sparkles className="w-5 h-5 lg:w-6 lg:h-6 text-[#1A0E1C]" />
            </div>
            <span className="gold-text text-lg lg:text-xl font-semibold tracking-tight">
              Omnyra
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/create" label="Create" />
            <NavLink href="/dashboard#videos" label="My Videos" />
            <NavLink href="/studio" label="Studio" />
            <NavLink href="/dashboard/settings" label="Account" />
          </nav>

          <button
            onClick={handleSignOut}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        {/* Greeting */}
        <section className="mb-14">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-[var(--text-primary)]">
            {greeting}, {firstName}.
          </h1>
          <div className="mt-3 text-sm md:text-base">
            {loading ? (
              <span className="text-[var(--text-secondary)]/60">Loading your studio…</span>
            ) : lowCredits ? (
              <span className="text-[var(--accent-gold)]">
                <span className="gold-text">{credits}</span> credits remaining ·{" "}
                <Link
                  href="/dashboard/credits"
                  className="underline underline-offset-4 hover:text-[var(--accent-rose)] transition-colors"
                >
                  Top up credits →
                </Link>
              </span>
            ) : (
              <span className="text-[var(--text-secondary)]">
                <span className="gold-text">{credits.toLocaleString()}</span> credits remaining
              </span>
            )}
          </div>
        </section>

        {/* Outcome cards */}
        <section className="mb-20">
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              What are you creating today?
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
            {OUTCOMES.map((o) => (
              <OutcomeCard key={o.id} outcome={o} />
            ))}
          </div>
        </section>

        {/* Recent videos */}
        <section id="videos" className="mb-20 scroll-mt-24">
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              Recent Videos
            </h2>
            {renders.length > 0 && (
              <Link
                href="/dashboard/creator"
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                See all →
              </Link>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-hidden"
                >
                  <div className="aspect-video bg-[rgba(212,168,67,0.05)] animate-pulse" />
                  <div className="p-4 h-14 bg-[var(--bg-surface)]" />
                </div>
              ))}
            </div>
          ) : renders.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {renders.map((r) => (
                <RenderCard key={r.id} render={r} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 p-12 text-center">
              <p className="text-lg text-[var(--text-secondary)] mb-6">
                Your first video is one prompt away.
              </p>
              <Link
                href="/create"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[var(--accent-gold)] to-[var(--accent-rose)] text-[#1A0E1C] text-sm font-semibold shadow-[0_0_30px_-6px_rgba(212,168,67,0.5)] transition-all hover:shadow-[0_0_40px_-6px_rgba(212,168,67,0.7)] hover:-translate-y-0.5"
              >
                Create my first video
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </section>

        {/* Studio mode footer */}
        <section className="border-t border-[var(--border-subtle)] pt-10 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-[var(--text-secondary)] text-sm">Need more control?</p>
              <p className="text-[var(--text-secondary)]/50 text-xs mt-1">
                Access individual tools, voice cloning, advanced settings
              </p>
            </div>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[rgba(212,168,67,0.35)] hover:bg-[rgba(212,168,67,0.05)] text-sm font-medium transition-colors self-start sm:self-auto"
            >
              Open Studio Mode
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
