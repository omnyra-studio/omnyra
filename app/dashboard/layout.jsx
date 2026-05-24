export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard-theme min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {children}
    </div>
  );
}
