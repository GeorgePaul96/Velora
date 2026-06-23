// Settings tab: registered geofenced sites + SaaS platform operations summary.
interface SettingsViewProps {
  sites: any[];
}

export default function SettingsView({ sites }: SettingsViewProps) {
  return (
    <div>
      <div className="card-title-bar">
        <h2>Master Console Settings</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <div className="card-panel">
          <h3>Registered Locations (Sites)</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            {sites.map((s, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "10px", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                <div>
                  <strong>{s.label}</strong> <br />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>GPS: [{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}] • Radius: {s.radius_m}m</span>
                </div>
              </div>
            ))}
            {sites.length === 0 && (
              <div style={{ color: "var(--text-muted)" }}>No geofenced sites created yet.</div>
            )}
          </div>
        </div>

        <div className="card-panel">
          <h3>SaaS Platform Operations</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>Monitor MRR subscriptions and tenant configurations across the Waiting-Time Recovery platform.</p>
          <div className="metrics-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="metric-card" style={{ background: "rgba(0,0,0,0.2)" }}>
              <div className="metric-title">Active Platform Tenants</div>
              <div className="metric-value">1</div>
              <div className="metric-subtext">Tenant MRR: £199.00</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
