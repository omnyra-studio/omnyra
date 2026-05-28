"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";
import posthog from "posthog-js";

export default function SigninPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) router.replace("/dashboard");
      }).catch(() => {});
    } catch {}
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Clear any stale tokens first
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith("sb-")) localStorage.removeItem(k);
      });
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      if (data.session) {
        posthog.identify(data.session.user.id, { email: data.session.user.email });
        posthog.capture('user_signed_in', { email: data.session.user.email });
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <AnimatedBackground />
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 10 }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "2.5rem",
        background: "rgba(45,10,62,0.75)", backdropFilter: "blur(12px)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ marginBottom: 24 }}>
          <img src="/logo-nav.png" alt="Omnyra AI"
            style={{ height: 64, width: "auto", objectFit: "contain", display: "block" }} />
        </div>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
          Welcome back
        </h1>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 28 }}>
          Sign in to your Omnyra AI account
        </p>
        {error && (
          <div style={{ background: "#2a1111", border: "0.5px solid #5a1f1f",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="email" placeholder="Email address" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={{ padding: "12px 16px", borderRadius: 10, border: "0.5px solid #2a2a2a",
              background: "#1a1a1a", color: "#fff", fontSize: 14, outline: "none" }} />
          <input type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
            style={{ padding: "12px 16px", borderRadius: 10, border: "0.5px solid #2a2a2a",
              background: "#1a1a1a", color: "#fff", fontSize: 14, outline: "none" }} />
          <button type="submit" disabled={loading}
            style={{ marginTop: 8, padding: "14px", borderRadius: 10,
              background: loading ? "#333" : "#fff", color: loading ? "#666" : "#000",
              fontWeight: 700, fontSize: 15, border: "none", cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s" }}>
            {loading ? "Signing in..." : "Sign in →"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#444" }}>
          Don&apos;t have an account?{" "}
          <span onClick={() => router.push("/signup")}
            style={{ color: "#7c6fff", cursor: "pointer" }}>Get started free</span>
        </p>
      </div>
      </div>
    </div>
  );
}
