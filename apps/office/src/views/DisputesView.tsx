// Disputes tab: list of disputed claims + a review panel to approve/reject/mark-paid.
import { formatLondonTime } from "../lib/format";

interface DisputesViewProps {
  disputes: any[];
  activeDispute: any;
  setActiveDispute: (v: any) => void;
  disputeNotes: string;
  setDisputeNotes: (v: string) => void;
  onResolve: (status: "approved" | "rejected" | "paid") => void;
}

export default function DisputesView({ disputes, activeDispute, setActiveDispute, disputeNotes, setDisputeNotes, onResolve }: DisputesViewProps) {
  return (
    <div>
      <div className="card-title-bar">
        <h2>Disputes Hub</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "24px" }}>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Disputed Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((d, i) => (
                <tr key={i}>
                  <td><strong>{d.job?.reference}</strong></td>
                  <td>{d.job?.customer?.name}</td>
                  <td>
                    <span className={`badge badge-${d.status}`}>{d.status}</span>
                  </td>
                  <td>{formatLondonTime(d.disputed_at).slice(0, 10)}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => setActiveDispute(d)}>Review</button>
                  </td>
                </tr>
              ))}
              {disputes.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No active disputed waiting-time claims.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {activeDispute ? (
          <div className="card-panel">
            <h3>Claim Review: {activeDispute.job?.reference}</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "8px 0 20px" }}>Dispute Reason: "{activeDispute.reason}"</p>

            <div className="form-group">
              <label className="form-label">Internal notes</label>
              <textarea rows={3} className="form-control" value={disputeNotes} onChange={e => setDisputeNotes(e.target.value)} placeholder="Logs, corrections, or settlement notes..." />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <button className="btn btn-success" onClick={() => onResolve("approved")}>Approve Claim (Settled)</button>
              <button className="btn btn-danger" onClick={() => onResolve("rejected")}>Reject Claim (Voided)</button>
              <button className="btn btn-primary" onClick={() => onResolve("paid")}>Mark Invoiced & Paid</button>
              <button className="btn btn-secondary" onClick={() => setActiveDispute(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="card-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "var(--text-muted)" }}>
            Select a dispute to review claim logs.
          </div>
        )}
      </div>
    </div>
  );
}
