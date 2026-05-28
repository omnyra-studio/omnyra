"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function deriveFirstName(email) {
  if (!email) return "Account";
  const local = email.split("@")[0];
  const stripped = local.replace(/[0-9]/g, "");
  const first = stripped.split(/[._\-]/)[0];
  if (!first) return "Account";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export default function AppNav() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const firstName =
    user?.user_metadata?.first_name ||
    deriveFirstName(user?.email);
  const isStudio = plan === "studio";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/signin");
  }

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b"
      style={{ background: "rgba(45,10,62,0.75)", borderColor: "rgba(212,168,67,0.12)" }}
    >
      <div
        className="max-w-7xl mx-auto flex items-center justify-between"
        style={{ padding: "8px 24px" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <span className="gold-text font-display text-2xl font-bold tracking-tight">Omnyra</span>
          </Link>
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{
              background: "#50B388",
              animation: "pulseSoft 2.5s ease-in-out infinite",
              boxShadow: "0 0 6px rgba(80,179,136,0.6)",
            }}
          />
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-10">
          {[
            { href: "/create", label: "Create" },
            { href: "/videos", label: "My Videos" },
            { href: "/profile", label: "Profile" },
            { href: "/brand", label: "Brand" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                color: "rgba(255,255,255,0.95)",
                fontSize: "1.05rem",
                fontWeight: 500,
                textDecoration: "none",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#E879F9")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.95)")}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right: Upgrade + Profile dropdown */}
        <div className="flex items-center gap-3">
          {!isStudio && (
            <a
              href="/dashboard/credits"
              style={{
                background: "linear-gradient(135deg, #C9A84C, #FFD700)",
                color: "#1a0a2e",
                padding: "8px 18px",
                borderRadius: "20px",
                fontWeight: "700",
                fontSize: "0.9rem",
                textDecoration: "none",
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
              }}
            >
              Upgrade ✦
            </a>
          )}

          {/* Profile dropdown */}
          <div ref={dropRef} style={{ position: "relative" }}>
            <button
              onClick={() => setIsOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                borderRadius: "9999px",
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
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #CFA42F, #E879F9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#0D0010",
                  flexShrink: 0,
                }}
              >
                {firstName?.charAt(0) || "U"}
              </div>
              <span>{firstName}</span>
              <span style={{ fontSize: "10px", opacity: 0.6 }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  minWidth: "180px",
                  background: "rgba(45,10,62,0.95)",
                  border: "1px solid rgba(207,164,47,0.2)",
                  borderRadius: "12px",
                  backdropFilter: "blur(16px)",
                  overflow: "hidden",
                  zIndex: 100,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {[
                  { label: "✦ Dashboard", href: "/dashboard" },
                  { label: "🎬 My Creations", href: "/videos" },
                  { label: "👤 Profile", href: "/profile" },
                  { label: "🏷️ Brand", href: "/brand" },
                  { label: "⚙️ Settings", href: "/settings" },
                  { label: "🚀 Upgrade", href: "/dashboard/credits" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    style={{
                      display: "block",
                      padding: "10px 16px",
                      fontSize: "13px",
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
                    fontSize: "13px",
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
  );
}
