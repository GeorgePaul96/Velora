// Jobs tab: log book table with per-job calculate / evidence / approve-flags actions.
import { Icons } from "../components/icons";
import { formatGBP, formatLondonTime } from "../lib/format";

interface JobsViewProps {
  jobs: any[];
  onNewJob: () => void;
  onCalculate: (jobId: string) => void;
  onDownloadPDF: (jobId: string, reference: string) => void;
  onAcknowledgeFlags: (jobId: string) => void;
}

export default function JobsView({ jobs, onNewJob, onCalculate, onDownloadPDF, onAcknowledgeFlags }: JobsViewProps) {
  return (
    <div>
      <div className="card-title-bar">
        <h2>Jobs Log Book</h2>
        <button className="btn btn-primary" onClick={onNewJob}><Icons.Plus /> Log Manual Job</button>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Vehicle Type</th>
              <th>Driver</th>
              <th>Booking Slot</th>
              <th>Charge</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, idx) => {
              const hasFlags = job.calc_result?.flags?.length > 0;
              return (
                <tr key={idx}>
                  <td><strong>{job.reference}</strong></td>
                  <td>{job.customer?.name}</td>
                  <td>{job.vehicle_type?.label}</td>
                  <td>{job.driver_id ? "Driver Assigned" : "Unassigned"}</td>
                  <td>{formatLondonTime(job.booking_slot_at)}</td>
                  <td>
                    {job.calc_result ? (
                      <span style={{ fontWeight: "bold" }}>{formatGBP(job.calc_result.chargePence)}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${job.status}`}>{job.status}</span>
                    {hasFlags && <span style={{ marginLeft: "6px", color: "var(--danger)", fontSize: "11px", fontWeight: "bold" }}>⚠️ {job.calc_result.flags.length} Flags</span>}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => onCalculate(job.id)}>Calculate</button>
                      {job.calc_result && (
                        <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => onDownloadPDF(job.id, job.reference)}>Evidence</button>
                      )}
                      {job.status === "flagged" && (
                        <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => onAcknowledgeFlags(job.id)}>Approve</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>No jobs registered yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
