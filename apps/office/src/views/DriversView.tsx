// Drivers/Compliance tab: driver scorecard table (geofence vs manual check-in auditing).
interface DriversViewProps {
  drivers: any[];
}

export default function DriversView({ drivers }: DriversViewProps) {
  return (
    <div>
      <div className="card-title-bar">
        <h2>GPS Geofence Compliance Logs</h2>
      </div>

      <div className="card-panel">
        <h3>Driver scorecard</h3>
        <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>Auditing check-ins vs manual inputs to maintain geofence billing credibility.</p>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Driver Name</th>
                <th>Total Jobs</th>
                <th>Late Arrivals</th>
                <th>Manual Check-ins</th>
                <th>Bypassed Geofences</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d, i) => (
                <tr key={i}>
                  <td><strong>{d.full_name}</strong></td>
                  <td>12</td>
                  <td>2</td>
                  <td>3</td>
                  <td>1</td>
                  <td>
                    <span style={{ fontWeight: "bold", color: "var(--success)" }}>88% Good</span>
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>No drivers registered. Check onboarding driver portal.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
