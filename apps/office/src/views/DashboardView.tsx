// Dashboard tab: recovery metrics, 30-day trend, top customers, customer risk table.
import type React from "react";
import { Icons } from "../components/icons";
import { formatGBP } from "../lib/format";

interface DashboardViewProps {
  analytics: any;
  riskProfiles: any[];
  onExportCSV: () => void;
  onCSVUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function DashboardView({ analytics, riskProfiles, onExportCSV, onCSVUpload }: DashboardViewProps) {
  return (
    <div>
      <div className="card-title-bar">
        <h2>Operational Summary</h2>
        <div style={{ display: "flex", gap: "12px" }}>
          <button className="btn btn-secondary" onClick={onExportCSV}><Icons.Download /> Export Billing CSV</button>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            <Icons.Plus /> Bulk CSV Import
            <input type="file" accept=".csv" style={{ display: "none" }} onChange={onCSVUpload} />
          </label>
        </div>
      </div>

      {/* Metrics cards */}
      <div className="metrics-grid">
        <div className="metric-card success">
          <div className="metric-title">Recovered Revenue (Month)</div>
          <div className="metric-value">{formatGBP(analytics.recoveredThisMonthPence)}</div>
          <div className="metric-subtext">Approved and paid invoice claims</div>
        </div>
        <div className="metric-card primary">
          <div className="metric-title">Recovered Revenue (YTD)</div>
          <div className="metric-value">{formatGBP(analytics.recoveredYTDPence)}</div>
          <div className="metric-subtext">Cumulative waiting charges</div>
        </div>
        <div className="metric-card warning">
          <div className="metric-title">Pending Claims</div>
          <div className="metric-value">{formatGBP(analytics.pendingRecoveryPence)}</div>
          <div className="metric-subtext">Jobs calculated and awaiting review</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">SaaS Cost ROI</div>
          <div className="metric-value" style={{ color: "var(--success)" }}>
            {analytics.recoveredThisMonthPence ? (analytics.recoveredThisMonthPence / 19900).toFixed(1) + "x" : "0.0x"}
          </div>
          <div className="metric-subtext">ROI vs £199.00 subscription</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
        {/* Daily Trend Mocked Graphic Bar Chart */}
        <div className="card-panel">
          <h3>Revenue Recovered (Last 30 Days)</h3>
          <div className="chart-container">
            {analytics.recoveryTrend?.map((t: any, i: number) => {
              const heightPercent = Math.min(100, Math.max(10, (t.chargePence / (analytics.averageWaitingChargePence || 1)) * 50));
              return (
                <div key={i} className="chart-bar-wrapper">
                  <div className="chart-bar" style={{ height: `${heightPercent}%` }} data-value={formatGBP(t.chargePence)}></div>
                  <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>{t.date.slice(8, 10)}</span>
                </div>
              );
            })}
            {(!analytics.recoveryTrend || analytics.recoveryTrend.length === 0) && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "var(--text-muted)" }}>No recovery data logged in range.</div>
            )}
          </div>
        </div>

        {/* Customer rankings */}
        <div className="card-panel">
          <h3>Top Billing Customers</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "20px" }}>
            {analytics.customerRankings?.map((c: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div>
                  <strong>{i+1}. {c.customerName}</strong>
                </div>
                <div style={{ color: "var(--success)", fontWeight: "bold" }}>{formatGBP(c.chargePence)}</div>
              </div>
            ))}
            {(!analytics.customerRankings || analytics.customerRankings.length === 0) && (
              <div style={{ color: "var(--text-muted)" }}>No billing logs yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Customer Risk profile quadrants (3.6) */}
      <div className="card-panel">
        <h3>Customer Risk & Profitability Intelligence</h3>
        <div className="table-responsive" style={{ marginTop: "16px" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Avg Site Delay</th>
                <th>Avg Claim Value</th>
                <th>Dispute Frequency</th>
                <th>Avg Payment Latency</th>
                <th>Acceptance Rate</th>
                <th>Profitability Index</th>
              </tr>
            </thead>
            <tbody>
              {riskProfiles.map((p, i) => (
                <tr key={i}>
                  <td><strong>{p.customer_name}</strong></td>
                  <td>{p.average_wait_minutes} mins</td>
                  <td>{formatGBP(p.average_claim_pence)}</td>
                  <td>
                    <span className={`badge ${p.dispute_rate > 30 ? "badge-flagged" : "badge-invoiced"}`}>{p.dispute_rate}%</span>
                  </td>
                  <td>{p.payment_speed_days} days</td>
                  <td>{p.claim_acceptance_rate}%</td>
                  <td>
                    <span style={{
                      fontWeight: "bold",
                      color: p.profitability_score > 75 ? "var(--success)" : p.profitability_score > 40 ? "var(--warning)" : "var(--danger)"
                    }}>
                      {p.profitability_score} / 100
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
