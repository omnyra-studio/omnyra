"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { supabase } from "../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";
import posthog from "posthog-js";

const darkInp = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "0.5px solid rgba(207,164,47,0.25)",
  background: "rgba(13,0,16,0.8)",
  color: "#E8DEFF",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const CARD = {
  width: "100%",
  maxWidth: 440,
  padding: "2.5rem",
  background: "rgba(45,10,62,0.75)",
  backdropFilter: "blur(12px)",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.1)",
};

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "free";

  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [promoCode, setPromoCode]   = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) router.replace("/dashboard");
      }).catch(() => {});
    } catch {}
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!promoCode.trim()) {
      setError("Beta access code is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName, promo_code: promoCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) throw new Error(signInError.message);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        posthog.identify(session.user.id, {
          email: email.trim().toLowerCase(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          plan: "free",
        });
        posthog.capture("user_signed_up", {
          email: email.trim().toLowerCase(),
          plan,
          has_promo: true,
        });

        await supabase.from("profiles").upsert({
          id: session.user.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          plan: "free",
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("has_completed_onboarding")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile?.has_completed_onboarding === true) {
          router.push("/dashboard");
          return;
        }
      }

      router.push("/welcome");
    } catch (err) {
      console.error("[signup] error:", err);
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <AnimatedBackground />
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 10, padding: "1.5rem" }}>
        <div style={CARD}>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontWeight: 700, fontSize: 22, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Omnyra
            </span>
          </div>

          <p style={{ fontSize: 12, color: "#D4A843", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            {plan === "free" ? "Free Plan" : `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`}
          </p>
          <h1 style={{ color: "#FFFFFF", fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
            Create your account
          </h1>
          <p style={{ color: "#BBA8C8", fontSize: 14, marginBottom: 28 }}>
            Start building with Omnyra AI
          </p>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.3)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#f87171", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <input type="text" placeholder="First name" value={firstName}
                onChange={e => setFirstName(e.target.value)} required style={darkInp} />
              <input type="text" placeholder="Last name" value={lastName}
                onChange={e => setLastName(e.target.value)} required style={darkInp} />
            </div>

            <input type="email" placeholder="Email address" value={email}
              onChange={e => setEmail(e.target.value)} required style={darkInp} />

            <input type="password" placeholder="Password (min 8 characters)" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={8} style={darkInp} />

            <div>
              <label style={{ display: "block", fontSize: 12, color: "#D4A843", fontWeight: 600, marginBottom: 6, letterSpacing: "0.05em" }}>
                Beta Access Code (required)
              </label>
              <input
                value={promoCode}
                onChange={e => setPromoCode(e.target.value.replace(/[^\x00-\x7F]/g, ''))}
                placeholder="Enter your beta access code"
                required
                style={{ ...darkInp, textTransform: "uppercase", letterSpacing: "0.08em" }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8, padding: "14px", borderRadius: 10,
                background: loading
                  ? "rgba(255,255,255,0.05)"
                  : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                backgroundSize: !loading ? "200% auto" : undefined,
                animation: !loading ? "metalShimmer 3s linear infinite" : undefined,
                color: loading ? "#555" : "#0D0010",
                fontWeight: 700, fontSize: 15, border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.2s",
              }}
            >
              {loading ? "Creating account..." : "Get started ->"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#BBA8C8" }}>
            Already have an account?{" "}
            <span onClick={() => router.push("/signin")}
              style={{ color: "#D4A843", cursor: "pointer", textDecoration: "underline" }}>
              Sign in
            </span>
          </p>
        </div>
      </div>

      <style>{`@keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }`}</style>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
