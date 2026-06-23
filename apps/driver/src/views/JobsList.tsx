// Jobs tab (no active job): list of jobs assigned to this driver today.
import type { AssignedJob } from "../db.js";

interface JobsListProps {
  assignedJobs: AssignedJob[];
  onSelectJob: (job: AssignedJob) => void;
}

export default function JobsList({ assignedJobs, onSelectJob }: JobsListProps) {
  return (
    <div>
      <h3 style={{ marginBottom: "16px" }}>Assigned Jobs Today</h3>
      {assignedJobs.map((job, idx) => (
        <div key={idx} className="job-card" onClick={() => onSelectJob(job)}>
          <div className="job-ref">{job.reference}</div>
          <div className="job-customer">{job.customerName}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)" }}>
            <span>Vehicle: {job.vehicleTypeLabel}</span>
            <span className="sync-badge online">{job.stops.length} Stops</span>
          </div>
        </div>
      ))}
      {assignedJobs.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
          No active jobs assigned today. Check again later.
        </div>
      )}
    </div>
  );
}
