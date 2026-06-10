"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usePostHog } from "posthog-js/react";

const HIDE_ROUTES = ["/", "/signin", "/signup", "/welcome"];

function deriveFirstName(email) {
  if (!email) return "Account";
  const local = email.split("@")[0];
  const stripped = local.replace(/[0-9]/g, "");
  const first = stripped.split(/[._-]/)[0];
  if (!first) return "Account";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export default function GlobalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const posthog = usePostHog();
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [dropOpen, setDropOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const dropRef = useRef(null);

  const isHidden =
    HIDE_ROUTES.includes(pathname) ||
    (pathname.startsWith("/dashboard/") &&
      pathname !== "/dashboard/credits" &&
      pathname !== "/dashboard/brand" &&
      pathname !== "/dashboard/intelligence");

  useEffect(() => {
    if (isHidden) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      setUser(session.user);
      supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => setPlan(data?.plan || "free"));
    });
  }, [isHidden, pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (isHidden) return null;

  const firstName =
    user?.user_metadata?.first_name || deriveFirstName(user?.email);
  const isStudio = (plan || "").toLowerCase() === "studio";

  async function handleSignOut() {
    posthog?.reset();
    await supabase.auth.signOut();
    router.replace("/signin");
  }

  return (
    <>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(16px)",
          background: "rgba(45,10,62,0.85)",
          borderBottom: "1px solid rgba(207,164,47,0.15)",
        }}
      >
        <div
          style={{
            maxWidth: "80rem",
            margin: "0 auto",
            padding: "8px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: "1.5rem",
                background: "linear-gradient(90deg,#CFA42F,#E8B84B)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Omnyra
            </span>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex" style={{ alignItems: "center", gap: 4 }}>
            {[
              { href: "/dashboard", label: "Create" },
              { href: "/voice-studio", label: "Voice" },
              { href: "/videos", label: "My Videos" },
              { href: "/usage", label: "Usage" },
              { href: "/analytics", label: "Analytics" },
              { href: "/profile", label: "Profile" },
              { href: "/dashboard/brand", label: "Brand" },
              { href: "/dashboard/intelligence", label: "Intelligence" },
            ].map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    color: active ? "#fff" : "rgba(255,255,255,0.75)",
                    fontSize: "1rem",
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                    padding: "6px 14px",
                    borderRadius: 9999,
                    background: active ? "rgba(255,255,255,0.06)" : "transparent",
                    transition: "color 0.2s",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right: Upgrade + user dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!isStudio && (
              <button
                onClick={() => { setShowUpgradeModal(true); posthog?.capture('upgrade_clicked', { plan: plan || 'free', location: 'nav' }); }}
                style={{
                  background: "linear-gradient(135deg, #C9A84C, #FFD700)",
                  color: "#1a0a2e",
                  padding: "8px 18px",
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  border: "none",
                  cursor: "pointer",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                Upgrade ✦
              </button>
            )}

            <div ref={dropRef} style={{ position: "relative" }}>
              <button
                onClick={() => setDropOpen((o) => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderRadius: 9999,
                  background: "rgba(75,30,130,0.6)",
                  border: "1px solid rgba(207,164,47,0.3)",
                  color: "#FFFFFF",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #CFA42F, #E879F9)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#0D0010",
                    flexShrink: 0,
                  }}
                >
                  {firstName?.charAt(0) || "U"}
                </div>
                <span>{firstName}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>
                  {dropOpen ? "▲" : "▼"}
                </span>
              </button>

              {dropOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    minWidth: 180,
                    background: "rgba(45,10,62,0.95)",
                    border: "1px solid rgba(207,164,47,0.2)",
                    borderRadius: 12,
                    backdropFilter: "blur(16px)",
                    overflow: "hidden",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {[
                    { label: "✦ Dashboard", href: "/dashboard" },
                    { label: "🎙️ Voice Studio", href: "/voice-studio" },
                    { label: "📹 My Creations", href: "/videos" },
                    { label: "👤 Profile", href: "/profile" },
                    { label: "🏷️ Brand Memory", href: "/dashboard/brand" },
                    { label: "🧠 Intelligence", href: "/dashboard/intelligence" },
                    { label: "⚙️ Settings", href: "/settings" },
                    { label: "🚀 Upgrade", href: "/dashboard/credits" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDropOpen(false)}
                      style={{
                        display: "block",
                        padding: "10px 16px",
                        fontSize: 13,
                        color: "#E8DEFF",
                        borderBottom: "1px solid rgba(207,164,47,0.1)",
                        textDecoration: "none",
                      }}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={handleSignOut}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 13,
                      color: "#E879F9",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    → Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {showUpgradeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "rgba(45,10,62,0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(201,168,76,0.3)",
              borderRadius: 16,
              padding: 40,
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
            }}
          >
            <h2
              style={{
                color: "#fff",
                marginBottom: 12,
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              Payments launching soon ✦
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.8)",
                marginBottom: 24,
                lineHeight: 1.6,
                fontSize: 14,
              }}
            >
              To upgrade your plan during beta, email us directly and we&apos;ll
              sort it within 24 hours.
            </p>
            <a
              href="mailto:info@omnyra.studio"
              style={{
                display: "block",
                background:
                  "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                backgroundSize: "200% auto",
                animation: "metalShimmer 3s linear infinite",
                color: "#0D0010",
                padding: "12px 24px",
                borderRadius: 10,
                fontWeight: 700,
                textDecoration: "none",
                marginBottom: 12,
                fontSize: 14,
              }}
            >
              Email info@omnyra.studio
            </a>
            <button
              onClick={() => setShowUpgradeModal(false)}
              style={{
                color: "rgba(255,255,255,0.6)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }`}</style>
    </>
  );
}
