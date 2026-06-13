import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// --- SVG Icons ---
const Icons = {
  Dashboard: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
  ),
  Jobs: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
  ),
  Disputes: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
  Contracts: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
  ),
  Drivers: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  Settings: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  LogOut: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
  ),
  Plus: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
  ),
  Download: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
  ),
  Alert: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
  )
};

// --- Format Helpers ---
const formatGBP = (pence: number | null) => {
  if (pence === null) return "£0.00";
  return "£" + (pence / 100).toFixed(2);
};

const formatLondonTime = (isoString: string | null) => {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

export default function App() {
  // --- States ---
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem("supabase_url") || import.meta.env.VITE_SUPABASE_URL || "");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(() => localStorage.getItem("supabase_anon_key") || import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  const [isConnected, setIsConnected] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [appUser, setAppUser] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);

  // --- Dynamic Data States ---
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>({
    recoveredThisMonthPence: 0,
    recoveredYTDPence: 0,
    pendingRecoveryPence: 0,
    averageWaitingChargePence: 0,
    totalWaitingHoursRecovered: 0,
    recoveryTrend: [],
    customerRankings: []
  });
  const [riskProfiles, setRiskProfiles] = useState<any[]>([]);

  // Onboarding Wizard States
  const [wizardStep, setWizardStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState({
    companyName: "",
    billingEmail: "",
    vehicleLabel: "Artic",
    customerName: "",
    freeTimeBasis: "per_job",
    freeTimeMinutes: 120,
    hourlyRatePence: 5000,
    termsBody: "Standard Conditions: Waiting time starts after booking slot or arrival (whichever is later) and is rounded up to the nearest 15 minutes. Free time allowance applies."
  });

  // Manual Job Creator state
  const [jobForm, setJobForm] = useState({
    reference: "",
    customerId: "",
    vehicleTypeId: "",
    driverId: "",
    bookingSlotAt: "",
    stops: [
      { sequence: 1, siteId: "", bookingSlotAt: "", arrivalAt: "", departureAt: "", source: "manual" }
    ]
  });

  // Dispute detailed modal / review state
  const [activeDispute, setActiveDispute] = useState<any>(null);
  const [disputeNotes, setDisputeNotes] = useState("");

  // Customer Contract state
  const [contractForm, setContractForm] = useState({
    customerId: "",
    label: "Annual Carrier Agreement",
    effectiveDate: "",
    expiryDate: "",
    rules: [] as any[]
  });

  // Initialize Supabase Client dynamically
  const getSupabaseClient = () => {
    return createClient(supabaseUrl, supabaseAnonKey);
  };

  // Check connection & session
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setIsLoading(false);
      return;
    }
    const client = getSupabaseClient();
    setIsConnected(true);

    client.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserProfile(session.user.id);
      } else {
        setAppUser(null);
        setTenant(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabaseUrl, supabaseAnonKey]);

  // Load User details & Tenant
  const loadUserProfile = async (authId: string) => {
    setIsLoading(true);
    try {
      const client = getSupabaseClient();
      const { data: userProfile, error: profileErr } = await client
        .from("app_user")
        .select("*, tenant:tenant_id(*)")
        .eq("auth_id", authId)
        .maybeSingle();

      if (profileErr) {
        setErrorMsg("Failed to load user profile. Make sure database migrations have run.");
        console.error(profileErr);
      } else if (!userProfile) {
        // User exists in auth but no profile row -> Onboarding is needed
        setHasCompletedOnboarding(false);
      } else {
        setAppUser(userProfile);
        setTenant(userProfile.tenant);
        setHasCompletedOnboarding(true);
        loadAllData(userProfile.tenant_id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Dashboard, lists, options, disputes
  const loadAllData = async (tenantId: string) => {
    const client = getSupabaseClient();
    
    // 1. Fetch tables
    const { data: j } = await client.from("job").select("*, customer:customer_id(name), vehicle_type:vehicle_type_id(label)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    const { data: c } = await client.from("customer").select("*").eq("tenant_id", tenantId).order("name", { ascending: true });
    const { data: vt } = await client.from("vehicle_type").select("*").eq("tenant_id", tenantId).order("label", { ascending: true });
    const { data: s } = await client.from("site").select("*").eq("tenant_id", tenantId).order("label", { ascending: true });
    const { data: u } = await client.from("app_user").select("*").eq("tenant_id", tenantId).eq("role", "driver");
    const { data: d } = await client.from("dispute").select("*, job:job_id(reference, customer:customer_id(name))").eq("tenant_id", tenantId);

    if (j) setJobs(j);
    if (c) setCustomers(c);
    if (vt) setVehicleTypes(vt);
    if (s) setSites(s);
    if (u) setDrivers(u);
    if (d) setDisputes(d);

    // 2. Fetch analytics & risk using RPCs
    try {
      const { data: revData } = await client.rpc("get_revenue_analytics", { p_tenant_id: tenantId });
      if (revData) setAnalytics(revData);
      
      const { data: riskData } = await client.rpc("get_customer_risk_profiles", { p_tenant_id: tenantId });
      if (riskData) setRiskProfiles(riskData);
    } catch (err) {
      console.error("RPC queries failed. RPC functions might not be deployed yet.", err);
    }
  };

  // Save Credentials (if not set in env)
  const saveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (supabaseUrl && supabaseAnonKey) {
      localStorage.setItem("supabase_url", supabaseUrl);
      localStorage.setItem("supabase_anon_key", supabaseAnonKey);
      setIsConnected(true);
      window.location.reload();
    }
  };

  // Handle Auth Login
  const handleAuth = async (email: string, mode: "magic" | "demo") => {
    setErrorMsg("");
    setSuccessMsg("");
    const client = getSupabaseClient();
    
    if (mode === "magic") {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) {
        setErrorMsg("Failed to send login email: " + error.message);
      } else {
        setSuccessMsg("Success! Magic link sent to your email inbox.");
      }
    } else {
      // Demo Mode login (Bypasses email verification with a mock demo auth signup/signin or database seed check)
      // For local testing, we can check if auth email exists, else sign up
      const { data, error } = await client.auth.signInWithPassword({
        email: "demo@wtr.com",
        password: "demodemo"
      });

      if (error) {
        // Attempt sign up if demo user is missing
        const { error: signUpError } = await client.auth.signUp({
          email: "demo@wtr.com",
          password: "demodemo"
        });
        
        if (signUpError) {
          setErrorMsg("Failed to initialize Demo Session: " + signUpError.message);
        } else {
          setSuccessMsg("Demo profile created! Please sign in again with Demo button.");
        }
      } else {
        setSession(data.session);
        loadUserProfile(data.session.user.id);
      }
    }
  };

  // Complete Onboarding Wizard
  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const client = getSupabaseClient();
    
    try {
      // Step 1: Create tenant
      const { data: tData, error: tErr } = await client
        .from("tenant")
        .insert({ name: onboardingData.companyName, billing_email: onboardingData.billingEmail })
        .select()
        .single();
        
      if (tErr || !tData) throw new Error("Tenant creation failed: " + tErr?.message);

      // Step 2: Create profile row
      const { error: uErr } = await client
        .from("app_user")
        .insert({
          tenant_id: tData.id,
          auth_id: session.user.id,
          role: "owner",
          full_name: "Office Manager"
        });
        
      if (uErr) throw new Error("Profile creation failed: " + uErr.message);

      // Step 3: Create vehicle type
      const { data: vtData, error: vtErr } = await client
        .from("vehicle_type")
        .insert({ tenant_id: tData.id, label: onboardingData.vehicleLabel })
        .select()
        .single();
        
      if (vtErr || !vtData) throw new Error("Vehicle type creation failed: " + vtErr?.message);

      // Step 4: Create terms template
      const { data: tmData, error: tmErr } = await client
        .from("terms_template")
        .insert({ tenant_id: tData.id, label: "Default Clause", body_md: onboardingData.termsBody })
        .select()
        .single();
        
      if (tmErr || !tmData) throw new Error("Terms creation failed: " + tmErr?.message);

      // Link terms template to tenant default
      await client.from("tenant").update({ default_terms_id: tmData.id }).eq("id", tData.id);

      // Step 5: Create customer
      const { data: cData, error: cErr } = await client
        .from("customer")
        .insert({
          tenant_id: tData.id,
          name: onboardingData.customerName,
          free_time_basis: onboardingData.freeTimeBasis,
          free_time_minutes: onboardingData.freeTimeMinutes,
          terms_template_id: tmData.id
        })
        .select()
        .single();

      if (cErr || !cData) throw new Error("Customer creation failed: " + cErr?.message);

      // Step 6: Create customer rate
      const { error: rErr } = await client
        .from("customer_rate")
        .insert({
          tenant_id: tData.id,
          customer_id: cData.id,
          vehicle_type_id: vtData.id,
          hourly_rate_pence: onboardingData.hourlyRatePence
        });

      if (rErr) throw new Error("Customer rates creation failed: " + rErr.message);

      // Step 7: Create subscription tier for ROI calculation (3.2)
      await client.from("tenant_subscription").insert({
        tenant_id: tData.id,
        monthly_cost_pence: 19900,
        currency: "GBP"
      });

      // Reload
      loadUserProfile(session.user.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Onboarding failed");
    }
  };

  // Trigger calculation edge function (1.4)
  const triggerCalculation = async (jobId: string) => {
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/calculate-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ jobId })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccessMsg("Recalculation complete! Refreshed waiting charge: " + formatGBP(data.result?.chargePence));
        loadAllData(tenant.id);
      } else {
        setErrorMsg("Calculation failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      setErrorMsg("Failed to call Edge Function: " + String(e));
    }
  };

  // Download Evidence Pack PDF (1.5)
  const downloadPDF = async (jobId: string, reference: string) => {
    setErrorMsg("");
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/evidence-pack?jobId=${jobId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `evidence_pack_${reference}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const errJson = await response.json().catch(() => ({}));
        setErrorMsg("Failed to generate PDF: " + (errJson.error || "Ensure job has arrival/departure timestamps and is calculated."));
      }
    } catch (e) {
      setErrorMsg("Failed to reach PDF builder: " + String(e));
    }
  };

  // CSV Export Trigger (1.6)
  const triggerCSVExport = async () => {
    setErrorMsg("");
    // Default range: last 30 days
    const fromStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);
    
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/export?from=${fromStr}&to=${toStr}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        const text = await response.text();
        const blob = new Blob([text], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `waiting_time_export_${fromStr}_to_${toStr}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        setErrorMsg("Failed to export CSV");
      }
    } catch (e) {
      setErrorMsg("Failed to reach exporter: " + String(e));
    }
  };

  // Bulk CSV File Import Upload (3.7)
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg("");
    setSuccessMsg("");
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/import-jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            "Authorization": `Bearer ${session.access_token}`
          },
          body: text
        });
        const data = await response.json();
        if (response.ok) {
          setSuccessMsg(`CSV Upload successful! Imported ${data.records_processed} jobs.`);
          loadAllData(tenant.id);
        } else {
          setErrorMsg("CSV Import failed: " + (data.error || "Ensure header fields match template."));
        }
      } catch (err) {
        setErrorMsg("Sync connection failed: " + String(err));
      }
    };
    reader.readAsText(file);
  };

  // Manual Job Creation Form Submit (1.7.4)
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    const client = getSupabaseClient();
    
    try {
      // 1. Insert job row
      const { data: jobData, error: jobErr } = await client
        .from("job")
        .insert({
          tenant_id: tenant.id,
          customer_id: jobForm.customerId,
          vehicle_type_id: jobForm.vehicleTypeId,
          reference: jobForm.reference,
          driver_id: jobForm.driverId || null,
          booking_slot_at: jobForm.bookingSlotAt || null
        })
        .select()
        .single();

      if (jobErr || !jobData) throw new Error("Job insertion failed: " + jobErr?.message);

      // 2. Insert stops
      for (const stop of jobForm.stops) {
        const { error: stopErr } = await client
          .from("job_stop")
          .insert({
            tenant_id: tenant.id,
            job_id: jobData.id,
            site_id: stop.siteId || null,
            sequence: stop.sequence,
            booking_slot_at: stop.bookingSlotAt || null,
            arrival_at: stop.arrivalAt || null,
            departure_at: stop.departureAt || null,
            source: "manual"
          });
        if (stopErr) throw new Error(`Stop ${stop.sequence} insertion failed: ` + stopErr.message);
      }

      setSuccessMsg("Job created! Running calculation...");
      triggerCalculation(jobData.id);
      setCurrentTab("jobs");
      
      // Reset form
      setJobForm({
        reference: "",
        customerId: "",
        vehicleTypeId: "",
        driverId: "",
        bookingSlotAt: "",
        stops: [{ sequence: 1, siteId: "", bookingSlotAt: "", arrivalAt: "", departureAt: "", source: "manual" }]
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create job");
    }
  };

  // Dispute state transition (3.3)
  const handleResolveDispute = async (status: "approved" | "rejected" | "paid") => {
    setErrorMsg("");
    setSuccessMsg("");
    const client = getSupabaseClient();
    
    try {
      // Get office profile
      const { data: prof } = await client.from("app_user").select("id").eq("auth_id", session.user.id).single();

      // Update dispute record
      const { error: dispErr } = await client
        .from("dispute")
        .update({
          status,
          internal_notes: disputeNotes,
          resolved_at: new Date().toISOString()
        })
        .eq("id", activeDispute.id);

      if (dispErr) throw new Error("Failed to update dispute status");

      // Update job status
      const { error: jobErr } = await client
        .from("job")
        .update({ status })
        .eq("id", activeDispute.job_id);

      if (jobErr) throw new Error("Failed to update job status");

      // Log dispute history audit trail
      await client.from("dispute_history").insert({
        tenant_id: tenant.id,
        dispute_id: activeDispute.id,
        from_status: activeDispute.status,
        to_status: status,
        changed_by: prof!.id,
        notes: disputeNotes
      });

      setSuccessMsg(`Dispute updated to '${status.toUpperCase()}'!`);
      setActiveDispute(null);
      setDisputeNotes("");
      loadAllData(tenant.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to resolve dispute");
    }
  };

  // Flags reviewer acknowledgement
  const acknowledgeJobFlags = async (jobId: string) => {
    const client = getSupabaseClient();
    await client.from("job").update({ status: "calculated" }).eq("id", jobId);
    loadAllData(tenant.id);
  };

  // Add custom Customer Contract (3.4)
  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    const client = getSupabaseClient();

    try {
      const { data: contract, error: ccErr } = await client
        .from("customer_contract")
        .insert({
          tenant_id: tenant.id,
          customer_id: contractForm.customerId,
          label: contractForm.label,
          effective_date: contractForm.effectiveDate,
          expiry_date: contractForm.expiryDate
        })
        .select()
        .single();

      if (ccErr || !contract) throw new Error("Contract creation failed: " + ccErr?.message);

      // Create rules for each vehicle type
      for (const vt of vehicleTypes) {
        const ruleInput = contractForm.rules.find((r: any) => r.vehicleTypeId === vt.id) || {
          rate: 5000,
          freeTime: 60,
          basis: "per_job"
        };

        const { error: ruleErr } = await client.from("contract_rule").insert({
          tenant_id: tenant.id,
          contract_id: contract.id,
          vehicle_type_id: vt.id,
          hourly_rate_pence: ruleInput.rate,
          free_time_minutes: ruleInput.freeTime,
          free_time_basis: ruleInput.basis,
          rounding_increment: 15,
          rounding_mode: "up"
        });
        if (ruleErr) throw new Error("Failed to save contract rule: " + ruleErr.message);
      }

      setSuccessMsg("Contract saved successfully!");
      setContractForm({ customerId: "", label: "Annual Agreement", effectiveDate: "", expiryDate: "", rules: [] });
      loadAllData(tenant.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save contract");
    }
  };

  // --- Sub-form helpers ---
  const addStopFormRow = () => {
    setJobForm({
      ...jobForm,
      stops: [
        ...jobForm.stops,
        { sequence: jobForm.stops.length + 1, siteId: "", bookingSlotAt: "", arrivalAt: "", departureAt: "", source: "manual" }
      ]
    });
  };

  // --- Layout Renderers ---
  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <h2>Loading Waiting-Time Recovery Console...</h2>
      </div>
    );
  }

  // Connection Setup screen (stores credentials in localStorage)
  if (!isConnected) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Connect WTR Platform</h2>
            <p className="auth-subtitle">Configure Supabase connection parameters for local execution.</p>
          </div>
          <form onSubmit={saveCredentials}>
            <div className="form-group">
              <label className="form-label">Supabase URL</label>
              <input type="text" className="form-control" placeholder="https://xyz.supabase.co" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Anon Public API Key</label>
              <input type="password" className="form-control" placeholder="eyJhbGciOi..." value={supabaseAnonKey} onChange={e => setSupabaseAnonKey(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Connect Workspace</button>
          </form>
        </div>
      </div>
    );
  }

  // Auth Landing
  if (!session) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Velora Waiting-Time Recovery</h2>
            <p className="auth-subtitle">Haulier Office Portal</p>
          </div>
          {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success">{successMsg}</div>}
          
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input id="auth-email" type="email" className="form-control" placeholder="office@haulier.com" />
          </div>
          
          <button className="btn btn-primary" style={{ width: "100%", marginBottom: "16px" }} onClick={() => {
            const email = (document.getElementById("auth-email") as HTMLInputElement).value;
            handleAuth(email, "magic");
          }}>Send Magic Link</button>
          
          <div style={{ textAlign: "center", margin: "12px 0", fontSize: "12px", color: "var(--text-muted)" }}>— OR —</div>
          
          <button className="btn btn-secondary" style={{ width: "100%", borderColor: "var(--success-border)" }} onClick={() => handleAuth("", "demo")}>
            Sign In with Sandbox Demo
          </button>
        </div>
      </div>
    );
  }

  // Onboarding Wizard
  if (!hasCompletedOnboarding) {
    return (
      <div className="wizard-container">
        <div className="card-panel">
          <h2>Tenant Onboarding Setup</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "30px" }}>Configure WTR parameters for your haulage fleet.</p>
          
          <div className="wizard-steps">
            <div className={`wizard-step ${wizardStep === 1 ? "active" : "completed"}`}>1</div>
            <div className={`wizard-step ${wizardStep === 2 ? "active" : wizardStep > 2 ? "completed" : ""}`}>2</div>
            <div className={`wizard-step ${wizardStep === 3 ? "active" : ""}`}>3</div>
          </div>

          {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

          <form onSubmit={handleOnboarding}>
            {wizardStep === 1 && (
              <div>
                <h3 style={{ marginBottom: "20px" }}>1. Company Profile</h3>
                <div className="form-group">
                  <label className="form-label">Haulage Company Name</label>
                  <input type="text" className="form-control" placeholder="Speedy Freight Ltd" value={onboardingData.companyName} onChange={e => setOnboardingData({ ...onboardingData, companyName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Invoicing Email</label>
                  <input type="email" className="form-control" placeholder="billing@speedyfreight.co.uk" value={onboardingData.billingEmail} onChange={e => setOnboardingData({ ...onboardingData, billingEmail: e.target.value })} required />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setWizardStep(2)}>Continue</button>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h3 style={{ marginBottom: "20px" }}>2. Fleet Specifications</h3>
                <div className="form-group">
                  <label className="form-label">Primary Vehicle Type Label</label>
                  <input type="text" className="form-control" placeholder="Artic (44t)" value={onboardingData.vehicleLabel} onChange={e => setOnboardingData({ ...onboardingData, vehicleLabel: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Contractual Waiting Clause (Pre-filled template)</label>
                  <textarea rows={5} className="form-control" value={onboardingData.termsBody} onChange={e => setOnboardingData({ ...onboardingData, termsBody: e.target.value })} required />
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(1)}>Back</button>
                  <button type="button" className="btn btn-primary" onClick={() => setWizardStep(3)}>Continue</button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <h3 style={{ marginBottom: "20px" }}>3. Customer & Rates</h3>
                <div className="form-group">
                  <label className="form-label">Primary Customer Name</label>
                  <input type="text" className="form-control" placeholder="Sainsbury's Distribution" value={onboardingData.customerName} onChange={e => setOnboardingData({ ...onboardingData, customerName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Hourly Waiting Charge (£/hour)</label>
                  <input type="number" className="form-control" placeholder="50" defaultValue="50" onChange={e => setOnboardingData({ ...onboardingData, hourlyRatePence: parseFloat(e.target.value) * 100 })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Free Time Allowance (Minutes)</label>
                  <input type="number" className="form-control" placeholder="120" value={onboardingData.freeTimeMinutes} onChange={e => setOnboardingData({ ...onboardingData, freeTimeMinutes: parseInt(e.target.value) })} required />
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setWizardStep(2)}>Back</button>
                  <button type="submit" className="btn btn-success">Complete Setup</button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // Core App Dashboard Panel Layout
  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <nav className="sidebar">
        <div className="navbar-brand">WTR Console</div>
        <ul className="nav-links">
          <li className={`nav-item ${currentTab === "dashboard" ? "active" : ""}`} onClick={() => setCurrentTab("dashboard")}>
            <Icons.Dashboard /> Dashboard
          </li>
          <li className={`nav-item ${currentTab === "jobs" ? "active" : ""}`} onClick={() => setCurrentTab("jobs")}>
            <Icons.Jobs /> Jobs Management
          </li>
          <li className={`nav-item ${currentTab === "disputes" ? "active" : ""}`} onClick={() => setCurrentTab("disputes")}>
            <Icons.Disputes /> Disputes Hub
          </li>
          <li className={`nav-item ${currentTab === "contracts" ? "active" : ""}`} onClick={() => setCurrentTab("contracts")}>
            <Icons.Contracts /> Contract Rules
          </li>
          <li className={`nav-item ${currentTab === "drivers" ? "active" : ""}`} onClick={() => setCurrentTab("drivers")}>
            <Icons.Drivers /> Compliance Logs
          </li>
          <li className={`nav-item ${currentTab === "settings" ? "active" : ""}`} onClick={() => setCurrentTab("settings")}>
            <Icons.Settings /> Settings
          </li>
        </ul>
        <div style={{ marginTop: "auto" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "12px" }}>
            Signed in: {appUser?.full_name || session.user.email} <br /> ({tenant?.name})
          </div>
          <div className="nav-item" onClick={() => getSupabaseClient().auth.signOut()}>
            <Icons.LogOut /> Log Out
          </div>
        </div>
      </nav>

      {/* Main Panel Content */}
      <main className="main-content">
        {errorMsg && <div className="alert alert-danger" style={{ display: "flex", gap: "10px", alignItems: "center" }}><Icons.Alert /> {errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {/* Tab 1: Dashboard Panel */}
        {currentTab === "dashboard" && (
          <div>
            <div className="card-title-bar">
              <h2>Operational Summary</h2>
              <div style={{ display: "flex", gap: "12px" }}>
                <button className="btn btn-secondary" onClick={triggerCSVExport}><Icons.Download /> Export Billing CSV</button>
                <label className="btn btn-primary" style={{ cursor: "pointer" }}>
                  <Icons.Plus /> Bulk CSV Import
                  <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSVUpload} />
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
        )}

        {/* Tab 2: Jobs list panel */}
        {currentTab === "jobs" && (
          <div>
            <div className="card-title-bar">
              <h2>Jobs Log Book</h2>
              <button className="btn btn-primary" onClick={() => setCurrentTab("new-job")}><Icons.Plus /> Log Manual Job</button>
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
                            <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => triggerCalculation(job.id)}>Calculate</button>
                            {job.calc_result && (
                              <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => downloadPDF(job.id, job.reference)}>Evidence</button>
                            )}
                            {job.status === "flagged" && (
                              <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => acknowledgeJobFlags(job.id)}>Approve</button>
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
        )}

        {/* Tab 2b: Log Manual Job Form */}
        {currentTab === "new-job" && (
          <div className="card-panel" style={{ maxWidth: "800px", margin: "0 auto" }}>
            <div className="card-title-bar">
              <h2>Log Waiting Time Job</h2>
              <button className="btn btn-secondary" onClick={() => setCurrentTab("jobs")}>Back to List</button>
            </div>
            
            <form onSubmit={handleCreateJob}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label className="form-label">Job/Consignment Reference</label>
                  <input type="text" className="form-control" value={jobForm.reference} onChange={e => setJobForm({ ...jobForm, reference: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Booking Slot (Job level)</label>
                  <input type="datetime-local" className="form-control" value={jobForm.bookingSlotAt} onChange={e => setJobForm({ ...jobForm, bookingSlotAt: e.target.value })} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label className="form-label">Customer</label>
                  <select className="form-control" value={jobForm.customerId} onChange={e => setJobForm({ ...jobForm, customerId: e.target.value })} required>
                    <option value="">Select Customer...</option>
                    {customers.map((c, i) => <option key={i} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vehicle Type</label>
                  <select className="form-control" value={jobForm.vehicleTypeId} onChange={e => setJobForm({ ...jobForm, vehicleTypeId: e.target.value })} required>
                    <option value="">Select Type...</option>
                    {vehicleTypes.map((v, i) => <option key={i} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Driver (Optional)</label>
                  <select className="form-control" value={jobForm.driverId} onChange={e => setJobForm({ ...jobForm, driverId: e.target.value })}>
                    <option value="">Select Driver...</option>
                    {drivers.map((d, i) => <option key={i} value={d.id}>{d.full_name}</option>)}
                  </select>
                </div>
              </div>

              <h3 style={{ marginTop: "24px", marginBottom: "16px" }}>Stops Visited</h3>
              {jobForm.stops.map((stop, index) => (
                <div key={index} style={{ border: "1px solid rgba(255,255,255,0.05)", padding: "16px", borderRadius: "10px", marginBottom: "12px", background: "rgba(0,0,0,0.1)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <strong>Stop {stop.sequence}</strong>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Location Site</label>
                      <select className="form-control" value={stop.siteId} onChange={e => {
                        const newStops = [...jobForm.stops];
                        newStops[index].siteId = e.target.value;
                        setJobForm({ ...jobForm, stops: newStops });
                      }} required>
                        <option value="">Select Site...</option>
                        {sites.map((s, i) => <option key={i} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Booking Slot (At Site)</label>
                      <input type="datetime-local" className="form-control" value={stop.bookingSlotAt} onChange={e => {
                        const newStops = [...jobForm.stops];
                        newStops[index].bookingSlotAt = e.target.value;
                        setJobForm({ ...jobForm, stops: newStops });
                      }} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Arrival Timestamp</label>
                      <input type="datetime-local" className="form-control" value={stop.arrivalAt} onChange={e => {
                        const newStops = [...jobForm.stops];
                        newStops[index].arrivalAt = e.target.value;
                        setJobForm({ ...jobForm, stops: newStops });
                      }} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Departure Timestamp</label>
                      <input type="datetime-local" className="form-control" value={stop.departureAt} onChange={e => {
                        const newStops = [...jobForm.stops];
                        newStops[index].departureAt = e.target.value;
                        setJobForm({ ...jobForm, stops: newStops });
                      }} required />
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                <button type="button" className="btn btn-secondary" onClick={addStopFormRow}>+ Add stop</button>
                <button type="submit" className="btn btn-success" style={{ marginLeft: "auto" }}>Save & Calculate</button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Disputes Hub */}
        {currentTab === "disputes" && (
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
                    <button className="btn btn-success" onClick={() => handleResolveDispute("approved")}>Approve Claim (Settled)</button>
                    <button className="btn btn-danger" onClick={() => handleResolveDispute("rejected")}>Reject Claim (Voided)</button>
                    <button className="btn btn-primary" onClick={() => handleResolveDispute("paid")}>Mark Invoiced & Paid</button>
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
        )}

        {/* Tab 4: Customer Contracts (3.4) */}
        {currentTab === "contracts" && (
          <div>
            <div className="card-title-bar">
              <h2>Dynamic Customer Agreements</h2>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              {/* Active list */}
              <div className="card-panel">
                <h3>Contractual Clauses & Rates</h3>
                <div style={{ marginTop: "20px" }}>
                  <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Contracts customize waiting parameters and hourly charges per vehicle type dynamically based on job schedule dates.</p>
                </div>
              </div>

              {/* Creator form */}
              <div className="card-panel">
                <h3>Add Customer Agreement</h3>
                <form onSubmit={handleSaveContract}>
                  <div className="form-group">
                    <label className="form-label">Select Customer</label>
                    <select className="form-control" value={contractForm.customerId} onChange={e => setContractForm({ ...contractForm, customerId: e.target.value })} required>
                      <option value="">Select Customer...</option>
                      {customers.map((c, i) => <option key={i} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Agreement Label</label>
                    <input type="text" className="form-control" value={contractForm.label} onChange={e => setContractForm({ ...contractForm, label: e.target.value })} required />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Effective Date</label>
                      <input type="date" className="form-control" value={contractForm.effectiveDate} onChange={e => setContractForm({ ...contractForm, effectiveDate: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Expiry Date</label>
                      <input type="date" className="form-control" value={contractForm.expiryDate} onChange={e => setContractForm({ ...contractForm, expiryDate: e.target.value })} required />
                    </div>
                  </div>
                  
                  <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Save Contract</button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Driver Behaviour & Compliance (3.5) */}
        {currentTab === "drivers" && (
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
        )}

        {/* Tab 6: General Settings */}
        {currentTab === "settings" && (
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
        )}
      </main>
    </div>
  );
}
