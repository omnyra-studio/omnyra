"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { usePostHog } from "posthog-js/react";
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
  Mic,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import * as Q from "@/lib/db/query";
import { SCHEMA } from "@/lib/db/schema";
import AnimatedBackground from "@/components/AnimatedBackground";
import AnalyticsWidget from "@/components/AnalyticsWidget";

const OUTCOMES = [
  {
    id: "ugc-ad",
    icon: Film,
    emoji: "🎬",
    title: "Viral UGC Ad",
    desc: "Hook-driven ads that stop the scroll. Fast + premium.",
    href: "/create/viral-ugc",
  },
  {
    id: "storytime",
    icon: Smartphone,
    emoji: "📱",
    title: "TikTok Storytime",
    desc: "Narrative arc. Tension. Payoff. Built to retain.",
    href: "/create/tiktok-story",
  },
  {
    id: "influencer",
    icon: UserCircle2,
    emoji: "👤",
    title: "AI Influencer Clip",
    desc: "Your AI persona. Any scene. Any vibe. No limits.",
    href: "/create/ai-influencer",
  },
  {
    id: "product-launch",
    icon: ShoppingBag,
    emoji: "🛍️",
    title: "Product Launch Reel",
    desc: "Turn any product into cinematic social content.",
    href: "/create/product-launch",
  },
  {
    id: "faceless",
    icon: EyeOff,
    emoji: "😶",
    title: "Faceless Content",
    desc: "Voice + visuals. No face. No limits. Just results.",
    href: "/create/faceless",
  },
  {
    id: "voice-studio",
    icon: Mic,
    emoji: "🎙️",
    title: "Voice Studio",
    desc: "Choose from 1,000+ voices or clone your own in 30 seconds.",
    href: "/voice-studio",
  },
];

function getGreeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function deriveFirstName(email) {
  if (!email) return "there";
  const local = email.split("@")[0];
  const stripped = local.replace(/[0-9]/g, "");
  const first = stripped.split(/[._\-]/)[0];
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
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


function OutcomeCard({ outcome, voiceReady, onSelect }) {
  return (
    <Link
      href={outcome.href ?? `/create?template=${outcome.id}`}
      onClick={() => onSelect(outcome)}
      className="group relative flex flex-col justify-between p-6 rounded-2xl border hover:border-[rgba(212,168,67,0.45)] hover:shadow-[0_0_40px_-12px_rgba(212,168,67,0.25)] transition-all duration-200 min-h-[200px] overflow-hidden"
      style={{ background: 'rgba(75,30,130,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(207,164,47,0.2)' }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[var(--glow-gold)] blur-3xl" />
      </div>

      <div className="relative">
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(207,164,47,0.25)',
          border: '1px solid rgba(207,164,47,0.5)',
          marginBottom: '16px',
          fontSize: '26px',
          boxShadow: '0 0 12px rgba(207,164,47,0.2)',
        }}>
          <span aria-hidden>{outcome.emoji}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {outcome.title}
          </h3>
          {outcome.id === 'voice-studio' && voiceReady && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4ECB8C', fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ECB8C', display: 'inline-block' }} />
              Ready
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{outcome.desc}</p>
      </div>

      <div style={{
        marginTop: '24px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 20px',
        borderRadius: '9999px',
        background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
        backgroundSize: '200% auto',
        animation: 'metalShimmer 3s linear infinite',
        color: '#0D0010',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.03em',
        boxShadow: '0 0 16px rgba(207,164,47,0.4), inset 0 0 0 1px rgba(255,251,204,0.3)',
      }}>
        <span>Create</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

function RenderCard({ render, onDownload }) {
  const complete = render.status === "complete" || render.status === "completed";
  const processing = render.status === "processing" || render.status === "pending";

  return (
    <div className="group rounded-2xl overflow-hidden transition-colors hover:border-[rgba(212,168,67,0.45)]" style={{ background: 'rgba(75,30,130,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(207,164,47,0.2)' }}>
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
              onClick={() => onDownload?.(render)}
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
  const posthog = usePostHog();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [credits, setCredits] = useState(null);
  const [renders, setRenders] = useState([]);
  const [voiceReady, setVoiceReady] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting());
  useEffect(() => {
    const t = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();

        // getSession() reads from local storage/cookies.
        // On first load after sign-in the session may not yet be visible
        // in a fresh client instance — fall back to getUser() which
        // validates the session server-side via the cookie.
        let session = null;
        const { data: sessionData } = await supabase.auth.getSession();
        session = sessionData?.session ?? null;

        if (!session) {
          // Retry once via getUser() (makes a network call — more reliable)
          const { data: { user: freshUser } } = await supabase.auth.getUser();
          if (freshUser) {
            // getUser succeeded — rebuild a minimal session object to continue
            const { data: retrySession } = await supabase.auth.getSession();
            session = retrySession?.session ?? null;
          }
        }

        if (!session) {
          router.replace("/signin");
          return;
        }
        if (cancelled) return;
        setUser(session.user);

        if (posthog) {
          posthog.identify(session.user.id, {
            email: session.user.email,
            name: session.user.user_metadata?.first_name,
            created_at: session.user.created_at,
          });
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, credits, first_name')
          .eq('id', session.user.id)
          .single();

        const [rendersRes] = await Promise.allSettled([
          Q.renders(supabase).recentByUser(session.user.id, 4),
        ]);

        if (cancelled) return;

        if (rendersRes.status === "rejected") console.error("[dashboard] renders query failed:", rendersRes.reason);
        else if (rendersRes.value.error) console.error("[dashboard] renders query error:", rendersRes.value.error.message);

        const rendersData = rendersRes.status === "fulfilled" ? rendersRes.value.data : null;

        const resolvedPlan = profile?.plan?.toLowerCase() ?? null;
        setPlan(resolvedPlan);
        setRenders(rendersData ?? []);
        setCredits(profile?.credits ?? null);

        const { data: voiceProfile } = await supabase
          .from(SCHEMA.profiles.table)
          .select("voice_id")
          .eq(SCHEMA.profiles.columns.id, session.user.id)
          .single();
        setVoiceReady(!!voiceProfile?.voice_id);
        if (posthog) {
          posthog.identify(session.user.id, { plan: resolvedPlan });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [router, posthog]);

  const firstName =
    user?.user_metadata?.first_name ||
    (user?.email ? deriveFirstName(user.email) : "there");

  return (
    <div className="min-h-screen" style={{ position: 'relative', background: 'transparent' }}>
      <AnimatedBackground />
      <div style={{ position: 'relative', zIndex: 1 }}>

      <main className="max-w-6xl mx-auto px-6 py-6 md:py-8">
        {/* Page title */}
        <div className="page-title" style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "linear-gradient(105deg,#CFA42F,#F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: "1.5rem" }}>
          Dashboard
        </div>

        {/* Greeting */}
        <section className="mb-6">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Image
              src="/omnyra-logo.png"
              alt="Omnyra"
              width={0}
              height={0}
              sizes="100vw"
              style={{
                height: '120px',
                width: 'auto',
                mixBlendMode: 'screen',
                filter: 'drop-shadow(0 0 20px rgba(207,164,47,0.5))',
                display: 'block',
                margin: '0 auto 16px auto',
              }}
            />
            <h1 style={{
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
              fontWeight: 600,
              color: '#FFFFFF',
              textAlign: 'center',
            }}>
              {greeting}, {firstName}.
            </h1>
            <div style={{ marginTop: '8px', textAlign: 'center' }}>
              {loading ? (
                <span style={{ color: 'rgba(224,208,255,0.75)', fontSize: '0.95rem' }}>Loading your studio…</span>
              ) : (
                <Link href="/pricing" style={{ textDecoration: 'none' }}>
                  <span style={{ color: '#BBA8C8', fontSize: '0.95rem', cursor: 'pointer' }}>
                    <span className="gold-text">{plan ?? '—'}</span>
                    {plan != null && <span style={{ color: '#FFFFFF' }}> plan</span>}
                    {credits !== null && (
                      <span style={{
                        color: credits === 0 ? '#f87171' : credits < 20 ? '#F59E0B' : '#BBA8C8',
                        fontWeight: credits < 20 ? 600 : 400,
                      }}> · {credits} credits left</span>
                    )}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Outcome cards */}
        <section className="mb-6">
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              What are you creating today?
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
            {OUTCOMES.map((o) => (
              <OutcomeCard
                key={o.id}
                outcome={o}
                voiceReady={voiceReady}
                onSelect={(outcome) => posthog?.capture('template_selected', { template_id: outcome.id, template_title: outcome.title })}
              />
            ))}
          </div>
        </section>

        {/* Analytics */}
        {!loading && (
          <section className="mb-8">
            <AnalyticsWidget />
          </section>
        )}

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
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(75,30,130,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(207,164,47,0.2)' }}
                >
                  <div className="aspect-video bg-[rgba(212,168,67,0.05)] animate-pulse" />
                  <div className="p-4 h-14 bg-[var(--bg-surface)]" />
                </div>
              ))}
            </div>
          ) : renders.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {renders.map((r) => (
                <RenderCard
                  key={r.id}
                  render={r}
                  onDownload={(render) => posthog?.capture('video_downloaded', { render_id: render.id, created_at: render.created_at })}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-12 text-center" style={{ background: 'rgba(75,30,130,0.35)', backdropFilter: 'blur(12px)', borderColor: 'rgba(207,164,47,0.2)' }}>
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

      </main>
      </div>
    </div>
  );
}
