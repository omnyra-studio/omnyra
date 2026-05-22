"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { supabase } from "../../lib/supabase";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "free";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState("");
  const [promoValid, setPromoValid] = useState(false);

  useEffect(() => {
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) router.replace("/dashboard");
      }).catch(() => {});
    } catch {}
  }, [router]);

  async function validatePromo() {
    if (!promoCode.trim()) return;
    const res = await fetch("/api/promo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: promoCode })
    });
    const data = await res.json();
    if (data.valid) {
      setPromoMsg(data.message);
      setPromoValid(true);
    } else {
      setPromoMsg(data.error);
      setPromoValid(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) throw new Error(signInError.message);

      // Redeem promo code if valid
      if (promoValid && promoCode.trim()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await fetch("/api/promo/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: promoCode, userId: session.user.id })
          });
        }
      }

      // Route based on onboarding state — every new email signup lands on /welcome
      // unless the profile has already been marked completed (e.g. legacy users).
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
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
      } catch {
        /* fall through to /welcome on any error — safer default */
      }
      router.push("/welcome");
    } catch (err) {
      console.error("[signup] FULL ERROR:", JSON.stringify(err));
      setError(err.message || err.error_description || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", background:"#0a0a0a" }}>
      <div style={{ width:"100%", maxWidth:420, padding:"2.5rem",
        background:"#111", borderRadius:20, border:"0.5px solid #222" }}>
        <div style={{ marginBottom:24 }}>
          <img src="/logo-nav.png" alt="Omnyra AI" style={{ height:64, width:"auto", objectFit:"contain", display:"block" }} />
        </div>
        <p style={{ fontSize:12, color:"#7c6fff", fontWeight:600,
          letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
          {plan === "free" ? "Free Plan" : `${plan.charAt(0).toUpperCase()+plan.slice(1)} Plan`}
        </p>
        <h1 style={{ color:"#fff", fontSize:26, fontWeight:700, marginBottom:6 }}>
          Create your account
        </h1>
        <p style={{ color:"#666", fontSize:14, marginBottom:28 }}>
          Start building with Omnyra AI
        </p>
        {error && (
          <div style={{ background:"#2a1111", border:"0.5px solid #5a1f1f",
            borderRadius:8, padding:"10px 14px", marginBottom:16,
            color:"#f87171", fontSize:13 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input type="email" placeholder="Email address" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={{ padding:"12px 16px", borderRadius:10, border:"0.5px solid #2a2a2a",
              background:"#1a1a1a", color:"#fff", fontSize:14, outline:"none" }} />
          <input type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
            style={{ padding:"12px 16px", borderRadius:10, border:"0.5px solid #2a2a2a",
              background:"#1a1a1a", color:"#fff", fontSize:14, outline:"none" }} />
          <div style={{ position:"relative" }}>
            <input
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value); setPromoMsg(""); setPromoValid(false); }}
              placeholder="Promo code (optional)"
              style={{ padding:"12px 16px", borderRadius:10,
                border:`0.5px solid ${promoValid ? "#7c6fff" : "#2a2a2a"}`,
                background:"#1a1a1a", color:"#fff", fontSize:14,
                width:"100%", boxSizing:"border-box", outline:"none" }}
            />
            <button type="button" onClick={validatePromo}
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
                padding:"6px 12px", borderRadius:6, background:"#7c6fff22",
                border:"0.5px solid #7c6fff", color:"#7c6fff",
                fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Apply
            </button>
          </div>
          {promoMsg && (
            <p style={{ fontSize:13, color: promoValid ? "#7c6fff" : "#f87171", marginTop:-8 }}>
              {promoMsg}
            </p>
          )}
          <button type="submit" disabled={loading}
            style={{ marginTop:8, padding:"14px", borderRadius:10,
              background: loading ? "#333" : "#fff", color: loading ? "#666" : "#000",
              fontWeight:700, fontSize:15, border:"none", cursor: loading ? "not-allowed" : "pointer",
              transition:"all 0.2s" }}>
            {loading ? "Creating account..." : "Get started →"}
          </button>
        </form>
        <p style={{ textAlign:"center", marginTop:20, fontSize:13, color:"#444" }}>
          Already have an account?{" "}
          <span onClick={() => router.push("/signin")}
            style={{ color:"#7c6fff", cursor:"pointer" }}>Sign in</span>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
