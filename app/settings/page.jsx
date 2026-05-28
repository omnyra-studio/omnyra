"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import { supabase } from "@/lib/supabase";

const C = { text: "#E8DEFF", sub: "#BBA8C8" };
const CARD = {
  background: "rgba(75,30,130,0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(207,164,47,0.25)",
  borderRadius: 16,
};

function Toggle({ checked, onChange, label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 2 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "#8A7D92" }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 24,
          borderRadius: 9999,
          background: checked ? "rgba(207,164,47,0.8)" : "rgba(255,255,255,0.1)",
          border: checked ? "1px solid rgba(207,164,47,0.9)" : "1px solid rgba(255,255,255,0.15)",
          cursor: "pointer",
          position: "relative",
          transition: "all 0.2s",
          padding: 0,
        }}
      >
        <span style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          display: "block",
        }} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [creditBal, setCreditBal]         = useState(null);
  const [userPlan, setUserPlan]           = useState("free");
  const [emailNotifs, setEmailNotifs]     = useState(true);
  const [marketingEmails, setMarketing]   = useState(false);
  const [deleteInput, setDeleteInput]     = useState("");
  const [showDeleteModal, setShowDelete]  = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const uid = session.user.id;
      Promise.all([
        supabase.from("credits").select("balance").eq("user_id", uid).single(),
        supabase.from("profiles").select("plan, email_notifications, marketing_emails").eq("id", uid).single(),
      ]).then(([credRes, profRes]) => {
        setCreditBal(credRes.data?.balance ?? null);
        setUserPlan((profRes.data?.plan || "free").toLowerCase());
        if (profRes.data?.email_notifications != null) setEmailNotifs(profRes.data.email_notifications);
        if (profRes.data?.marketing_emails != null) setMarketing(profRes.data.marketing_emails);
      }).catch(() => {});
    });
  }, []);

  async function saveNotifPrefs() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from("profiles").upsert({
      id: session.user.id,
      email_notifications: emailNotifs,
      marketing_emails: marketingEmails,
    }).catch(() => {});
  }

  async function handleDeleteAccount() {
    if (deleteInput !== "DELETE") return;
    setDeleting(true);
    try {
      await supabase.auth.signOut();
      router.replace("/signin");
    } catch {
      setDeleting(false);
    }
  }

  const planLabel = userPlan.charAt(0).toUpperCase() + userPlan.slice(1);

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1.5rem 6rem", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Page title */}
          <div style={{ paddingTop: 8 }}>
            <div className="page-title" style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "linear-gradient(105deg,#CFA42F,#F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Settings
            </div>
          </div>

          {/* ACCOUNT — NOTIFICATIONS */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 16, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Notifications</div>

            <Toggle
              checked={emailNotifs}
              onChange={setEmailNotifs}
              label="Email notifications"
              desc="Receive updates when your renders complete"
            />
            <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
            <Toggle
              checked={marketingEmails}
              onChange={setMarketing}
              label="Marketing emails"
              desc="Tips, updates, and new feature announcements"
            />

            <button
              onClick={saveNotifPrefs}
              style={{
                alignSelf: "flex-start",
                padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                background: "rgba(207,164,47,0.12)", border: "1px solid rgba(207,164,47,0.35)", color: "#D4A843",
              }}
            >
              Save preferences
            </button>
          </div>

          {/* APPEARANCE */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 16, padding: "1.25rem", opacity: 0.7 }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Appearance</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 2 }}>Dark mode</div>
                <div style={{ fontSize: 12, color: "#8A7D92" }}>Always on — Omnyra is dark mode only</div>
              </div>
              <div style={{
                flexShrink: 0, width: 44, height: 24, borderRadius: 9999,
                background: "rgba(207,164,47,0.8)", border: "1px solid rgba(207,164,47,0.9)",
                position: "relative",
              }}>
                <span style={{ position: "absolute", top: 2, left: 22, width: 18, height: 18, borderRadius: "50%", background: "#fff", display: "block" }} />
              </div>
            </div>
          </div>

          {/* BILLING */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 16, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Billing</div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(207,164,47,0.15)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Current Plan</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#F0C040" }}>{planLabel}</div>
              </div>
              {creditBal !== null && (
                <div style={{ flex: "1 1 140px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(207,164,47,0.15)", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Credits Remaining</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#C084FC" }}>{creditBal}</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => router.push("/dashboard/credits")}
                style={{
                  padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                  background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                  backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite",
                  color: "#0D0010", border: "none",
                }}
              >
                View Plans →
              </button>
              <button
                onClick={() => setShowUpgradeModal(true)}
                style={{
                  padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: C.sub,
                }}
              >
                Manage Billing
              </button>
            </div>
          </div>

          {/* DANGER ZONE */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 16, padding: "1.25rem", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div style={{ fontSize: 10, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Danger Zone</div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 4 }}>Delete account</div>
              <div style={{ fontSize: 12, color: "#8A7D92", lineHeight: 1.5 }}>
                Permanently deletes your account and all associated data. This cannot be undone.
              </div>
            </div>

            <button
              onClick={() => setShowDelete(true)}
              style={{
                alignSelf: "flex-start",
                padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171",
              }}
            >
              Delete my account
            </button>
          </div>
        </div>
      </div>

      {/* DELETE MODAL */}
      {showDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        }}>
          <div style={{ ...CARD, maxWidth: 420, width: "100%", padding: "2rem", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171" }}>Delete account?</div>
            <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, margin: 0 }}>
              This will permanently delete your account, brand memory, credits, and all generated content. Type <strong style={{ color: "#f87171" }}>DELETE</strong> to confirm.
            </p>
            <input
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="Type DELETE to confirm"
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 10, boxSizing: "border-box",
                border: "1px solid rgba(239,68,68,0.4)", background: "#0D0010", color: "#f87171", fontSize: 14, fontFamily: "inherit", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setShowDelete(false); setDeleteInput(""); }}
                style={{
                  flex: 1, padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", color: C.sub,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput !== "DELETE" || deleting}
                style={{
                  flex: 1, padding: "11px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  cursor: deleteInput !== "DELETE" || deleting ? "not-allowed" : "pointer",
                  background: deleteInput === "DELETE" ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.35)", color: deleteInput === "DELETE" ? "#f87171" : "#8A7D92",
                  transition: "all 0.2s",
                }}
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }`}</style>

      {showUpgradeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "rgba(45,10,62,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 16, padding: 40, maxWidth: 440, width: "100%", textAlign: "center" }}>
            <h2 style={{ color: "#fff", marginBottom: 12, fontSize: 20, fontWeight: 700 }}>Payments launching soon ✦</h2>
            <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 24, lineHeight: 1.6, fontSize: 14 }}>
              To upgrade your plan during beta, email us directly and we&apos;ll sort it within 24 hours.
            </p>
            <a href="mailto:info@omnyra.studio" style={{ display: "block", background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)", backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite", color: "#0D0010", padding: "12px 24px", borderRadius: 10, fontWeight: 700, textDecoration: "none", marginBottom: 12, fontSize: 14 }}>
              Email info@omnyra.studio
            </a>
            <button onClick={() => setShowUpgradeModal(false)} style={{ color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
