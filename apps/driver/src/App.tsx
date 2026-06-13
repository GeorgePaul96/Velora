import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { db } from "./db.js";
import type { CaptureEvent, AssignedJob } from "./db.js";

// --- SVG Icons ---
const Icons = {
  Dashboard: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
  ),
  Jobs: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
  )
};

// --- Helpers ---
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // meters
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  // --- Supabase Config ---
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem("supabase_url") || import.meta.env.VITE_SUPABASE_URL || "");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(() => localStorage.getItem("supabase_anon_key") || import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  const [isConnected, setIsConnected] = useState(false);
  const [session, setSession] = useState<any>(null);
  
  // --- UI Tabs ---
  const [currentTab, setCurrentTab] = useState("jobs");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  // --- Data ---
  const [assignedJobs, setAssignedJobs] = useState<AssignedJob[]>([]);
  const [activeJob, setActiveJob] = useState<AssignedJob | null>(null);
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [pendingEventsCount, setPendingEventsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // --- Location & Geofencing ---
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [geofenceState, setGeofenceState] = useState<"outside" | "entering" | "inside" | "leaving">("outside");
  const [distanceToSite, setDistanceToSite] = useState<number | null>(null);
  const [timeOnSiteText, setTimeOnSiteText] = useState("");
  
  const watchIdRef = useRef<number | null>(null);
  const siteEntryTimerRef = useRef<number | null>(null);
  const siteExitTimerRef = useRef<number | null>(null);
  const entryTimestampRef = useRef<string | null>(null);
  const lastInsideTimestampRef = useRef<string | null>(null);
  const onSiteTimerIntervalRef = useRef<number | null>(null);

  // Initialize Supabase Client
  const getSupabaseClient = () => {
    return createClient(supabaseUrl, supabaseAnonKey);
  };

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setIsLoading(false);
      return;
    }
    const client = getSupabaseClient();
    setIsConnected(true);

    client.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadAssignedJobs(session.user.id);
      setIsLoading(false);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadAssignedJobs(session.user.id);
    });

    // Check IndexedDB counts
    db.getPendingEvents().then((evs) => setPendingEventsCount(evs.length));

    return () => subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey]);

  // Sync Timer
  useEffect(() => {
    const interval = setInterval(() => {
      triggerSync();
    }, 30000); // sync every 30s
    return () => clearInterval(interval);
  }, [session]);

  // Local Storage credentials save
  const saveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (supabaseUrl && supabaseAnonKey) {
      localStorage.setItem("supabase_url", supabaseUrl);
      localStorage.setItem("supabase_anon_key", supabaseAnonKey);
      setIsConnected(true);
      window.location.reload();
    }
  };

  // Sign In handlers
  const handleSignIn = async (email: string, mode: "magic" | "demo") => {
    setErrorMsg("");
    setSuccessMsg("");
    const client = getSupabaseClient();

    if (mode === "magic") {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) {
        setErrorMsg("Failed to send login email: " + error.message);
      } else {
        setSuccessMsg("Success! Login link sent to inbox.");
      }
    } else {
      // Sandbox Demo driver login
      const { data, error } = await client.auth.signInWithPassword({
        email: "driver@wtr.com",
        password: "driverdriver"
      });

      if (error) {
        // Sign up if user missing
        const { error: signUpError } = await client.auth.signUp({
          email: "driver@wtr.com",
          password: "driverdriver"
        });
        if (signUpError) {
          setErrorMsg("Failed to initialize Driver Demo: " + signUpError.message);
        } else {
          setSuccessMsg("Demo Driver created! Click sign in again.");
        }
      } else {
        setSession(data.session);
        loadAssignedJobs(data.session.user.id);
      }
    }
  };

  // Load jobs assigned to this driver
  const loadAssignedJobs = async (authId: string) => {
    try {
      const client = getSupabaseClient();
      
      // Get driver app user profile
      const { data: profile } = await client
        .from("app_user")
        .select("id, tenant_id")
        .eq("auth_id", authId)
        .single();
        
      if (!profile) return;

      // Query jobs assigned
      const { data: jobs } = await client
        .from("job")
        .select(`
          id,
          reference,
          status,
          customer:customer_id(name),
          vehicle_type:vehicle_type_id(label),
          stops:job_stop(id, sequence, site_id, booking_slot_at, arrival_at, departure_at)
        `)
        .eq("driver_id", profile.id)
        .in("status", ["open", "captured", "calculated", "flagged"]);

      if (jobs) {
        const mapped: AssignedJob[] = [];
        for (const j of jobs) {
          // Resolve stop details (sites)
          const stopsMapped = [];
          for (const s of (j.stops || [])) {
            const { data: site } = await client.from("site").select("label, latitude, longitude, radius_m").eq("id", s.site_id).single();
            stopsMapped.push({
              id: s.id,
              sequence: s.sequence,
              siteLabel: site?.label || "Site Stop",
              latitude: site?.latitude || 0,
              longitude: site?.longitude || 0,
              radiusM: site?.radius_m || 150,
              bookingSlotAt: s.booking_slot_at,
              arrivalAt: s.arrival_at,
              departureAt: s.departure_at
            });
          }
          stopsMapped.sort((a, b) => a.sequence - b.sequence);

          mapped.push({
            id: j.id,
            reference: j.reference,
            customerName: (j.customer as any)?.name || "Unknown Customer",
            vehicleTypeLabel: (j.vehicle_type as any)?.label || "Rigid",
            status: j.status,
            stops: stopsMapped
          });
        }
        
        setAssignedJobs(mapped);
        await db.saveJobs(mapped);
      }
    } catch (err) {
      console.error(err);
      // Fallback to offline cached jobs
      const cached = await db.getCachedJobs();
      setAssignedJobs(cached);
    }
  };

  // Enqueue event locally (IndexedDB)
  const enqueueEvent = async (type: CaptureEvent["type"], textValue?: string, photoBlobKey?: string) => {
    if (!activeJob) return;
    const activeStop = activeJob.stops[activeStopIndex];
    
    const event: CaptureEvent = {
      localId: generateUUID(),
      jobId: activeJob.id,
      stopSequence: activeStop.sequence,
      type,
      occurredAt: new Date().toISOString(),
      lat: currentPosition?.coords.latitude,
      lng: currentPosition?.coords.longitude,
      accuracyM: currentPosition?.coords.accuracy,
      source: watchIdRef.current ? "geofence" : "manual",
      textValue,
      photoBlobKey
    };

    await db.addEvent(event);
    const pending = await db.getPendingEvents();
    setPendingEventsCount(pending.length);
    setSuccessMsg(`Recorded ${type} event locally!`);
    triggerSync();
  };

  // Sync Routine (2.5)
  const triggerSync = async () => {
    if (!session || isSyncing) return;
    const pending = await db.getPendingEvents();
    if (pending.length === 0) return;

    setIsSyncing(true);
    const client = getSupabaseClient();

    try {
      const syncedIds: string[] = [];

      for (const ev of pending) {
        let photoPath = ev.photoBlobKey;
        
        // If event has local base64 photo, upload it first
        if (ev.type === "photo" && ev.photoBlobKey && ev.photoBlobKey.startsWith("data:image/jpeg;base64,")) {
          const base64Data = ev.photoBlobKey.replace("data:image/jpeg;base64,", "");
          
          // Convert base64 to binary blob
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: "image/jpeg" });
          
          const filePath = `${ev.jobId}/${ev.localId}.jpg`;
          const { data, error } = await client.storage.from("evidence").upload(filePath, blob);

          if (error) {
            console.error("Storage upload error:", error);
            continue; // retry next sync
          }
          photoPath = data.path;
        }

        // POST event batch to ingest-events API (idempotent)
        const response = await fetch(`${supabaseUrl}/functions/v1/ingest-events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            events: [{ ...ev, photoBlobKey: photoPath }]
          })
        });

        if (response.ok) {
          syncedIds.push(ev.localId);
        }
      }

      // Remove synced records from store
      for (const id of syncedIds) {
        await db.removeEvent(id);
      }

      const freshPending = await db.getPendingEvents();
      setPendingEventsCount(freshPending.length);
      if (syncedIds.length > 0) {
        setSuccessMsg(`Synced ${syncedIds.length} telemetry records.`);
        loadAssignedJobs(session.user.id);
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Foreground Geofence watchPosition (2.3)
  const startTracking = () => {
    if (!activeJob) return;
    setIsTracking(true);
    setErrorMsg("");

    if (!navigator.geolocation) {
      setErrorMsg("GPS is not supported on this device. Manual backup controls enabled.");
      return;
    }

    const stop = activeJob.stops[activeStopIndex];

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition(position);
        
        // Skip noisy readings
        if (position.coords.accuracy > 100) return;

        const distance = haversineDistance(
          position.coords.latitude,
          position.coords.longitude,
          stop.latitude,
          stop.longitude
        );

        setDistanceToSite(distance);
        processGeofenceReadings(distance, stop);
      },
      (error) => {
        console.error("GPS Error:", error);
        setErrorMsg("GPS access denied. Use manual controls.");
      },
      { enableHighAccuracy: true }
    );

    watchIdRef.current = watchId;
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    // Clear timeouts
    if (siteEntryTimerRef.current) clearTimeout(siteEntryTimerRef.current);
    if (siteExitTimerRef.current) clearTimeout(siteExitTimerRef.current);
    if (onSiteTimerIntervalRef.current) clearInterval(onSiteTimerIntervalRef.current);

    setIsTracking(false);
    setGeofenceState("outside");
    setDistanceToSite(null);
    setTimeOnSiteText("");
  };

  // Debounced geofencing state machine transitions (2.3.3)
  const processGeofenceReadings = (distance: number, stop: any) => {
    const now = new Date().toISOString();
    const isInsideRadius = distance <= stop.radiusM;

    if (isInsideRadius) {
      // Clear exit timer
      if (siteExitTimerRef.current) {
        clearTimeout(siteExitTimerRef.current);
        siteExitTimerRef.current = null;
      }

      if (geofenceState === "outside" || geofenceState === "leaving") {
        setGeofenceState("entering");
        
        // Record timestamp of FIRST reading inside geofence
        entryTimestampRef.current = now;

        // Debounce: must dwell 60s
        siteEntryTimerRef.current = setTimeout(async () => {
          setGeofenceState("inside");
          lastInsideTimestampRef.current = new Date().toISOString();

          // Enqueue arrival event automatically
          await enqueueEvent("arrival");

          // Start active onsite duration counter
          startOnSiteTimer();
        }, 60000);
      } else if (geofenceState === "inside") {
        lastInsideTimestampRef.current = now;
      }
    } else {
      // Clear entry timer
      if (siteEntryTimerRef.current) {
        clearTimeout(siteEntryTimerRef.current);
        siteEntryTimerRef.current = null;
      }

      if (geofenceState === "inside" || geofenceState === "entering") {
        setGeofenceState("leaving");

        // Debounce: must stay outside 120s
        siteExitTimerRef.current = setTimeout(async () => {
          setGeofenceState("outside");
          
          if (onSiteTimerIntervalRef.current) {
            clearInterval(onSiteTimerIntervalRef.current);
          }

          // Enqueue departure event timestamped at the LAST inside reading
          const departureTime = lastInsideTimestampRef.current || new Date().toISOString();
          
          const departureEvent: CaptureEvent = {
            localId: generateUUID(),
            jobId: activeJob!.id,
            stopSequence: stop.sequence,
            type: "departure",
            occurredAt: departureTime,
            lat: currentPosition?.coords.latitude,
            lng: currentPosition?.coords.longitude,
            accuracyM: currentPosition?.coords.accuracy,
            source: "geofence"
          };

          await db.addEvent(departureEvent);
          setPendingEventsCount((await db.getPendingEvents()).length);
          triggerSync();

        }, 120000);
      }
    }
  };

  // Live timer tick
  const startOnSiteTimer = () => {
    if (onSiteTimerIntervalRef.current) clearInterval(onSiteTimerIntervalRef.current);
    const startMs = Date.now();
    
    onSiteTimerIntervalRef.current = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
      const hrs = Math.floor(elapsedSec / 3600).toString().padStart(2, "0");
      const mins = Math.floor((elapsedSec % 3600) / 60).toString().padStart(2, "0");
      const secs = (elapsedSec % 60).toString().padStart(2, "0");
      setTimeOnSiteText(`Dwell Time: ${hrs}:${mins}:${secs}`);
    }, 1000);
  };

  // Camera Photo Input Handler (2.4.3)
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await enqueueEvent("photo", undefined, base64);
    };
    reader.readAsDataURL(file);
  };

  // Advance sequence stop
  const handleNextStop = () => {
    stopTracking();
    if (activeJob && activeStopIndex < activeJob.stops.length - 1) {
      setActiveStopIndex(activeStopIndex + 1);
      setTimeout(() => startTracking(), 1000);
    } else {
      // Completed last stop
      setActiveJob(null);
      setSuccessMsg("Job completed! Tracking offline sync sync...");
    }
  };

  // --- Render UI ---
  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <h2>Loading Driver Portal...</h2>
      </div>
    );
  }

  // Supabase params connection configuration
  if (!isConnected) {
    return (
      <div className="mobile-auth">
        <div className="mobile-auth-card">
          <h2>Configure Connection</h2>
          <form onSubmit={saveCredentials} style={{ marginTop: "16px" }}>
            <div className="form-group">
              <label className="form-label">Supabase Url</label>
              <input type="text" className="form-control" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Anon Key</label>
              <input type="password" className="form-control" value={supabaseAnonKey} onChange={e => setSupabaseAnonKey(e.target.value)} required />
            </div>
            <button type="submit" className="giant-btn btn-start">Connect App</button>
          </form>
        </div>
      </div>
    );
  }

  // Sign In Screen
  if (!session) {
    return (
      <div className="mobile-auth">
        <div className="mobile-auth-card">
          <h2 style={{ textAlign: "center", marginBottom: "8px" }}>WTR Driver App</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", textAlign: "center", marginBottom: "24px" }}>Idempotent Offline-First Geofence Tracking</p>
          {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success">{successMsg}</div>}

          <div className="form-group">
            <label className="form-label">Driver Email</label>
            <input id="driver-email" type="email" className="form-control" placeholder="driver@haulier.com" />
          </div>

          <button className="giant-btn btn-start" onClick={() => {
            const email = (document.getElementById("driver-email") as HTMLInputElement).value;
            handleSignIn(email, "magic");
          }}>Request Link</button>

          <div style={{ textAlign: "center", margin: "16px 0", fontSize: "12px", color: "var(--text-secondary)" }}>— OR —</div>

          <button className="giant-btn" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)", color: "#FFF" }} onClick={() => handleSignIn("", "demo")}>
            Sign In with Sandbox Demo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-title">WTR Driver</div>
        <div className={`sync-badge ${navigator.onLine ? "online" : "offline"}`}>
          {navigator.onLine ? "Online" : "Offline"}
        </div>
      </header>

      {/* Main Container */}
      <main className="mobile-content">
        {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {/* Tab 1: Assigned Jobs list */}
        {currentTab === "jobs" && !activeJob && (
          <div>
            <h3 style={{ marginBottom: "16px" }}>Assigned Jobs Today</h3>
            {assignedJobs.map((job, idx) => (
              <div key={idx} className="job-card" onClick={() => {
                setActiveJob(job);
                setActiveStopIndex(0);
              }}>
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
        )}

        {/* Active Geofencing Job tracking screen */}
        {activeJob && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 className="job-ref">{activeJob.reference}</h3>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Stop {activeStopIndex + 1} of {activeJob.stops.length}: {activeJob.stops[activeStopIndex].siteLabel}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => {
                stopTracking();
                setActiveJob(null);
              }}>Back</button>
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
              <button className="giant-btn btn-start" onClick={startTracking}>Start Automatic Tracking</button>
            ) : (
              <div>
                <button className="giant-btn btn-arrive" onClick={() => enqueueEvent("arrival")}>Manual Arrive Check-in</button>
                <button className="giant-btn btn-depart" onClick={() => enqueueEvent("departure")}>Manual Depart Check-out</button>
                
                <label className="giant-btn" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)", cursor: "pointer", color: "#FFF" }}>
                  📷 Attach Photo Evidence
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhotoCapture} />
                </label>

                <div className="form-group" style={{ marginTop: "16px" }}>
                  <label className="form-label">Gate POD/Consignment Ref</label>
                  <input id="pod-ref-input" type="text" className="form-control" placeholder="POD Signature Ref..." onBlur={(e) => {
                    if (e.target.value) {
                      enqueueEvent("pod_ref", e.target.value);
                      e.target.value = "";
                    }
                  }} />
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
                  <button className="giant-btn btn-start" onClick={handleNextStop}>
                    {activeStopIndex < activeJob.stops.length - 1 ? "Next Stop" : "Finish Job"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Sync Status */}
        {currentTab === "sync" && (
          <div style={{ textAlign: "center" }}>
            <h3 style={{ marginBottom: "16px" }}>Local Synchronization Engine</h3>
            
            <div className="job-card" style={{ background: "rgba(0,0,0,0.1)" }}>
              <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "8px" }}>Pending Uploads (Offline Buffer)</div>
              <div style={{ fontSize: "48px", fontWeight: "bold" }}>{pendingEventsCount}</div>
            </div>

            <button className="giant-btn btn-start" disabled={isSyncing || pendingEventsCount === 0} onClick={triggerSync}>
              {isSyncing ? "Uploading Batch..." : "Force Event Sync Now"}
            </button>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <footer className="bottom-nav">
        <div className={`nav-tab ${currentTab === "jobs" ? "active" : ""}`} onClick={() => setCurrentTab("jobs")}>
          <Icons.Jobs className="nav-tab-icon" />
          <span>Jobs</span>
        </div>
        <div className={`nav-tab ${currentTab === "sync" ? "active" : ""}`} onClick={() => setCurrentTab("sync")}>
          <Icons.Dashboard className="nav-tab-icon" style={{ transform: "rotate(45deg)" }} />
          <span>Sync ({pendingEventsCount})</span>
        </div>
      </footer>
    </div>
  );
}
