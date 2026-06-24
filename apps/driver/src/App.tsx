import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { db } from "./db.js";
import type { CaptureEvent, AssignedJob } from "./db.js";
import { haversineDistance, generateUUID } from "./lib/geo";
import ConnectionSetup from "./views/ConnectionSetup";
import SignIn from "./views/SignIn";
import JobsList from "./views/JobsList";
import ActiveJob from "./views/ActiveJob";
import SyncStatus from "./views/SyncStatus";
import MobileNav from "./components/MobileNav";

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

  // Initialize Supabase Client ONCE and reuse it. Creating a new client per call spawns
  // multiple GoTrueClient instances that cross-notify via storage, which re-fires
  // onAuthStateChange in a loop (causes screen flicker). Credentials only change via
  // saveCredentials(), which does a full page reload, so a single instance is safe.
  const clientRef = useRef<any>(null);
  const getSupabaseClient = () => {
    if (!clientRef.current) {
      clientRef.current = createClient(supabaseUrl, supabaseAnonKey);
    }
    return clientRef.current;
  };

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setIsLoading(false);
      return;
    }
    const client = getSupabaseClient();
    setIsConnected(true);

    client.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      if (session) loadAssignedJobs(session.user.id);
      setIsLoading(false);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event: any, session: any) => {
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
      <ConnectionSetup
        supabaseUrl={supabaseUrl}
        setSupabaseUrl={setSupabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        setSupabaseAnonKey={setSupabaseAnonKey}
        onSave={saveCredentials}
      />
    );
  }

  // Sign In Screen
  if (!session) {
    return <SignIn errorMsg={errorMsg} successMsg={successMsg} onSignIn={handleSignIn} />;
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
          <JobsList
            assignedJobs={assignedJobs}
            onSelectJob={(job) => {
              setActiveJob(job);
              setActiveStopIndex(0);
            }}
          />
        )}

        {/* Active Geofencing Job tracking screen */}
        {activeJob && (
          <ActiveJob
            activeJob={activeJob}
            activeStopIndex={activeStopIndex}
            isTracking={isTracking}
            geofenceState={geofenceState}
            timeOnSiteText={timeOnSiteText}
            distanceToSite={distanceToSite}
            currentPosition={currentPosition}
            onBack={() => {
              stopTracking();
              setActiveJob(null);
            }}
            onStartTracking={startTracking}
            onArrive={() => enqueueEvent("arrival")}
            onDepart={() => enqueueEvent("departure")}
            onPhotoCapture={handlePhotoCapture}
            onPodRef={(value) => enqueueEvent("pod_ref", value)}
            onNextStop={handleNextStop}
          />
        )}

        {/* Tab 2: Sync Status */}
        {currentTab === "sync" && (
          <SyncStatus
            pendingEventsCount={pendingEventsCount}
            isSyncing={isSyncing}
            onSync={triggerSync}
          />
        )}
      </main>

      {/* Bottom Nav */}
      <MobileNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        pendingEventsCount={pendingEventsCount}
      />
    </div>
  );
}
