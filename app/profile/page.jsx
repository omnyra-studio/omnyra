"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";

const C = { text: "#E8DEFF", sub: "#BBA8C8" };
const CARD = {
  background: "rgba(75,30,130,0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(207,164,47,0.25)",
  borderRadius: 16,
};
const inp = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid rgba(204,171,175,0.25)",
  background: "#0D0010",
  color: "#C084FC",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: 10, color: "#BBA8C8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
          {label}
        </label>
        {hint && <span style={{ fontSize: 11, color: "#8A7D92" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const ACTION_META = {
  script:  { icon: "📝", label: "Script / Caption", color: "#C084FC" },
  image:   { icon: "🖼️",  label: "Image",            color: "#60A5FA" },
  voice:   { icon: "🎙️", label: "Voice",             color: "#22D3EE" },
  video:   { icon: "🎬", label: "Video",             color: "#FB923C" },
  avatar:  { icon: "👤", label: "Avatar",            color: "#D4A843" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");
  const [userId, setUserId]       = useState(null);
  const [form, setForm]           = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [pwd, setPwd]             = useState({ current: "", next: "", confirm: "" });
  const [pwdMsg, setPwdMsg]       = useState({ text: "", ok: false });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [usageLogs, setUsageLogs] = useState([]);
  const [creditBal, setCreditBal] = useState(null);
  const [usedMonth, setUsedMonth] = useState(0);
  const [userPlan, setUserPlan]   = useState("free");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { router.replace("/signin"); return; }
      const user = session.user;
      setUserId(user.id);

      supabase.from("profiles").select("first_name,last_name,phone,plan").eq("id", user.id).single()
        .then(({ data: p }) => {
          setForm({
            firstName: p?.first_name || user.user_metadata?.first_name || "",
            lastName:  p?.last_name  || user.user_metadata?.last_name  || "",
            email:     user.email || "",
            phone:     p?.phone || "",
          });
          setUserPlan((p?.plan || "free").toLowerCase());
        });

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      Promise.all([
        supabase.from("usage_logs").select("*").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(20),
        supabase.from("credits").select("balance").eq("user_id", user.id).single(),
        supabase.from("credit_transactions")
          .select("amount").eq("user_id", user.id).eq("type", "debit")
          .gte("created_at", monthStart.toISOString()),
      ]).then(([logsRes, credRes, txRes]) => {
        setUsageLogs(logsRes.data ?? []);
        setCreditBal(credRes.data?.balance ?? null);
        const used = (txRes.data ?? []).reduce((sum, r) => sum + Math.abs(r.amount || 0), 0);
        setUsedMonth(used);
      }).catch(() => {}).finally(() => setLoading(false));
    });
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await supabase.from("profiles").upsert({
        id:         userId,
        first_name: form.firstName.trim() || null,
        last_name:  form.lastName.trim()  || null,
        phone:      form.phone.trim()     || null,
      });
      await supabase.auth.updateUser({
        data: {
          first_name: form.firstName.trim(),
          last_name:  form.lastName.trim(),
          full_name:  `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (!pwd.next || pwd.next !== pwd.confirm) {
      setPwdMsg({ text: "New passwords don't match.", ok: false });
      return;
    }
    if (pwd.next.length < 8) {
      setPwdMsg({ text: "Password must be at least 8 characters.", ok: false });
      return;
    }
    setPwdSaving(true);
    setPwdMsg({ text: "", ok: false });
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: pwd.current,
      });
      if (signInErr) throw new Error("Current password is incorrect.");
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwd.next });
      if (updateErr) throw new Error(updateErr.message);
      setPwdMsg({ text: "✓ Password updated successfully.", ok: true });
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwdMsg({ text: err.message, ok: false });
    } finally {
      setPwdSaving(false);
    }
  }

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(207,164,47,0.2)", borderTopColor: "#CFA42F", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1.5rem 6rem", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* PAGE TITLE */}
          <div className="page-title" style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "linear-gradient(105deg, #CFA42F, #F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            MY PROFILE
          </div>

          {/* PERSONAL DETAILS */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Personal Details</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="First Name">
                <input value={form.firstName} onChange={set("firstName")} placeholder="First name" style={inp} />
              </Field>
              <Field label="Last Name">
                <input value={form.lastName} onChange={set("lastName")} placeholder="Last name" style={inp} />
              </Field>
            </div>

            <Field label="Email" hint="read-only">
              <input value={form.email} readOnly style={{ ...inp, color: "#8A7D92", cursor: "default" }} />
            </Field>

            <Field label="Phone Number" hint="optional">
              <input value={form.phone} onChange={set("phone")} placeholder="+61 400 000 000" style={inp} type="tel" />
            </Field>
          </div>

          {/* CHANGE PASSWORD */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Change Password</div>

            <Field label="Current Password">
              <input value={pwd.current} onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} placeholder="Current password" style={inp} type="password" />
            </Field>
            <Field label="New Password">
              <input value={pwd.next} onChange={e => setPwd(p => ({ ...p, next: e.target.value }))} placeholder="New password (min 8 chars)" style={inp} type="password" />
            </Field>
            <Field label="Confirm New Password">
              <input value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} placeholder="Confirm new password" style={inp} type="password" />
            </Field>

            {pwdMsg.text && (
              <p style={{ fontSize: 13, color: pwdMsg.ok ? "#4ECB8C" : "#f87171", margin: 0 }}>{pwdMsg.text}</p>
            )}

            <button
              type="button"
              onClick={handlePasswordChange}
              disabled={pwdSaving || !pwd.current || !pwd.next || !pwd.confirm}
              style={{
                padding: "11px", borderRadius: 10, fontWeight: 600, fontSize: 14,
                cursor: (pwdSaving || !pwd.current || !pwd.next || !pwd.confirm) ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                color: "#E8DEFF", opacity: pwdSaving ? 0.5 : 1,
              }}
            >
              {pwdSaving ? "Updating..." : "Update Password"}
            </button>
          </div>

          {/* CREDIT USAGE */}
          <div id="usage" style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Credit Usage</div>

            {creditBal !== null && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "Used This Month", value: usedMonth, color: "#FB923C" },
                  { label: "Credits Remaining", value: creditBal, color: "#F0C040" },
                  { label: "Plan", value: userPlan.charAt(0).toUpperCase() + userPlan.slice(1), color: "#C084FC", isText: true },
                ].map(item => (
                  <div key={item.label} style={{ flex: "1 1 110px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(207,164,47,0.15)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: item.isText ? 15 : 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {usageLogs.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8A7D92", margin: 0, lineHeight: 1.6 }}>
                No credits used yet — start creating to see your history here.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 340 }}>
                  <thead>
                    <tr>
                      {["Action", "Credits", "Date"].map(h => (
                        <th key={h} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: h === "Credits" ? "right" : "left", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usageLogs.map((log, i) => {
                      const meta = ACTION_META[log.action_type] || { icon: "⚡", label: log.action_type, color: "#BBA8C8" };
                      return (
                        <tr key={log.id || i} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <td style={{ padding: "9px 8px" }}>
                            <span style={{ color: meta.color, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                              <span>{meta.icon}</span><span>{meta.label}</span>
                            </span>
                          </td>
                          <td style={{ padding: "9px 8px", fontSize: 13, fontWeight: 700, color: "#F0C040", textAlign: "right", whiteSpace: "nowrap" }}>
                            {log.credits_used != null ? `${log.credits_used} cr` : log.estimated_cost_usd != null ? `~$${log.estimated_cost_usd}` : "—"}
                          </td>
                          <td style={{ padding: "9px 8px", fontSize: 12, color: "#8A7D92", whiteSpace: "nowrap" }}>{timeAgo(log.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            style={{
              padding: "15px", borderRadius: 12, fontWeight: 700, fontSize: 15,
              cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: saved ? "rgba(78,203,140,0.15)" : saving ? "rgba(255,255,255,0.05)"
                : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
              backgroundSize: !saved && !saving ? "200% auto" : undefined,
              animation: !saved && !saving ? "metalShimmer 3s linear infinite" : undefined,
              color: saved ? "#4ECB8C" : saving ? "#555" : "#0D0010",
              border: saved ? "1px solid rgba(78,203,140,0.35)" : "none",
              transition: "all 0.2s",
            }}
          >
            {saving ? "Saving..." : saved ? "✓ Profile Saved!" : "Save Profile →"}
          </button>

          <p style={{ fontSize: 11, color: C.sub, textAlign: "center", margin: 0 }}>
            Your personal details are kept private and secure.
          </p>
        </div>
      </div>
      <style>{`
        @keyframes metalShimmer { 0% { background-position: 200% center } 100% { background-position: -200% center } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
