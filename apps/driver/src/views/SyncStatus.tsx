// Sync tab: offline buffer count + force-sync control.
interface SyncStatusProps {
  pendingEventsCount: number;
  isSyncing: boolean;
  onSync: () => void;
}

export default function SyncStatus({ pendingEventsCount, isSyncing, onSync }: SyncStatusProps) {
  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ marginBottom: "16px" }}>Local Synchronization Engine</h3>

      <div className="job-card" style={{ background: "rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Pending Uploads (Offline Buffer)</div>
        <div style={{ fontSize: "48px", fontWeight: "bold" }}>{pendingEventsCount}</div>
      </div>

      <button className="giant-btn btn-start" disabled={isSyncing || pendingEventsCount === 0} onClick={onSync}>
        {isSyncing ? "Uploading Batch..." : "Force Event Sync Now"}
      </button>
    </div>
  );
}
