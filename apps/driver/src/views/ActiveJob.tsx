// Active job tracking screen: geofence state banner, GPS metadata, capture controls.
// Purely presentational — all geofence/capture logic lives in App and arrives via callbacks.
import type React from "react";
import type { AssignedJob } from "../db.js";

interface ActiveJobProps {
  activeJob: AssignedJob;
  activeStopIndex: number;
  isTracking: boolean;
  geofenceState: "outside" | "entering" | "inside" | "leaving";
  timeOnSiteText: string;
  distanceToSite: number | null;
  currentPosition: GeolocationPosition | null;
  onBack: () => void;
  onStartTracking: () => void;
  onArrive: () => void;
  onDepart: () => void;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPodRef: (value: string) => void;
  onNextStop: () => void;
}

export default function ActiveJob({
  activeJob, activeStopIndex, isTracking, geofenceState, timeOnSiteText, distanceToSite,
  currentPosition, onBack, onStartTracking, onArrive, onDepart, onPhotoCapture, onPodRef, onNextStop
}: ActiveJobProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 className="job-ref">{activeJob.reference}</h3>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Stop {activeStopIndex + 1} of {activeJob.stops.length}: {activeJob.stops[activeStopIndex].siteLabel}</span>
        </div>
        <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={onBack}>Back</button>
      </div>

      {/* Geofence state banner */}
      <div className={`status-indicator-banner ${isTracking && geofenceState === "inside" ? "active" : "waiting"}`}>
        {!isTracking ? "GPS Tracking Offline" : geofenceState === "inside" ? `INSIDE RADIUS - ${timeOnSiteText}` : `WAITING TO ARRIVE (Distance: ${distanceToSite !== null ? Math.round(distanceToSite) + "m" : "Calculating.."})`}
      </div>

      {/* GPS Metadata info */}
      {currentPosition && (
        <div style={{ padding: "12px", border: "1px solid var(--border-color)", borderRadius: "8px", background: "rgba(0,0,0,0.2)", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          <span>GPS Lat/Lng: [{currentPosition.coords.latitude.toFixed(5)}, {currentPosition.coords.longitude.toFixed(5)}] • Accuracy: {Math.round(currentPosition.coords.accuracy)}m</span>
        </div>
      )}

      {/* Giants buttons controls */}
      {!isTracking ? (
        <button className="giant-btn btn-start" onClick={onStartTracking}>Start Automatic Tracking</button>
      ) : (
        <div>
          <button className="giant-btn btn-arrive" onClick={onArrive}>Manual Arrive Check-in</button>
          <button className="giant-btn btn-depart" onClick={onDepart}>Manual Depart Check-out</button>

          <label className="giant-btn" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)", cursor: "pointer", color: "#FFF" }}>
            📷 Attach Photo Evidence
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhotoCapture} />
          </label>

          <div className="form-group" style={{ marginTop: "16px" }}>
            <label className="form-label">Gate POD/Consignment Ref</label>
            <input id="pod-ref-input" type="text" className="form-control" placeholder="POD Signature Ref..." onBlur={(e) => {
              if (e.target.value) {
                onPodRef(e.target.value);
                e.target.value = "";
              }
            }} />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
            <button className="giant-btn btn-start" onClick={onNextStop}>
              {activeStopIndex < activeJob.stops.length - 1 ? "Next Stop" : "Finish Job"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
