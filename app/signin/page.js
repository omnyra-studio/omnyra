"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        // Surface a clear message for the most common issues
        if (error.message?.toLowerCase().includes("email not confirmed")) {
          throw new Error("Please confirm your email before signing in. Check your inbox for a confirmation link.");
        }
        if (error.message?.toLowerCase().includes("invalid login credentials")) {
          throw new Error("Incorrect email or password. Please try again.");
        }
        throw error;
      }

      // Resolve session — signInWithPassword always returns it on success,
      // but fall back to getSession() in case of edge-case timing issues.
      let session = data.session;
      if (!session) {
        const { data: sessionData } = await supabase.auth.getSession();
        session = sessionData?.session ?? null;
      }

      if (!session) {
        throw new Error("Sign in succeeded but no session was created. Please try again or contact support.");
      }

      posthog.identify(session.user.id, { email: session.user.email });
      posthog.capture('user_signed_in', { email: session.user.email });
      router.replace("/dashboard");
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
          <Image src="/logo-nav.png" alt="Omnyra AI"
            width={0} height={0} sizes="100vw"
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
