"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Image from "next/image";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "free";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
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
          <img src="/logo-nav.png" alt="Omnyra AI" style={{ height:64, width:'auto', objectFit:'contain', display:'block' }} />
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
