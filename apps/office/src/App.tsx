import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Icons } from "./components/icons";
import { formatGBP } from "./lib/format";
import Sidebar from "./components/Sidebar";
import ConnectionSetup from "./views/ConnectionSetup";
import AuthLanding from "./views/AuthLanding";
import OnboardingWizard from "./views/OnboardingWizard";
import DashboardView from "./views/DashboardView";
import JobsView from "./views/JobsView";
import NewJobView from "./views/NewJobView";
import DisputesView from "./views/DisputesView";
import ContractsView from "./views/ContractsView";
import DriversView from "./views/DriversView";
import SettingsView from "./views/SettingsView";

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

  // Initialize Supabase Client ONCE and reuse it. Creating a new client per call spawns
  // multiple GoTrueClient instances that cross-notify via storage, which re-fires
  // onAuthStateChange in a loop (caused the onboarding screen to flicker). Credentials only
  // change via saveCredentials(), which does a full page reload, so a single instance is safe.
  const clientRef = useRef<any>(null);
  const getSupabaseClient = () => {
    if (!clientRef.current) {
      clientRef.current = createClient(supabaseUrl, supabaseAnonKey);
    }
    return clientRef.current;
  };

  // Check connection & session
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setIsLoading(false);
      return;
    }
    const client = getSupabaseClient();
    setIsConnected(true);

    client.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      if (session) {
        loadUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event: any, session: any) => {
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
      <ConnectionSetup
        supabaseUrl={supabaseUrl}
        setSupabaseUrl={setSupabaseUrl}
        supabaseAnonKey={supabaseAnonKey}
        setSupabaseAnonKey={setSupabaseAnonKey}
        onSave={saveCredentials}
      />
    );
  }

  // Auth Landing
  if (!session) {
    return <AuthLanding errorMsg={errorMsg} successMsg={successMsg} onAuth={handleAuth} />;
  }

  // Onboarding Wizard
  if (!hasCompletedOnboarding) {
    return (
      <OnboardingWizard
        wizardStep={wizardStep}
        setWizardStep={setWizardStep}
        onboardingData={onboardingData}
        setOnboardingData={setOnboardingData}
        onSubmit={handleOnboarding}
        errorMsg={errorMsg}
      />
    );
  }

  // Core App Dashboard Panel Layout
  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        userName={appUser?.full_name || session.user.email || ""}
        tenantName={tenant?.name || ""}
        onSignOut={() => getSupabaseClient().auth.signOut()}
      />

      {/* Main Panel Content */}
      <main className="main-content">
        {errorMsg && <div className="alert alert-danger" style={{ display: "flex", gap: "10px", alignItems: "center" }}><Icons.Alert /> {errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {currentTab === "dashboard" && (
          <DashboardView
            analytics={analytics}
            riskProfiles={riskProfiles}
            onExportCSV={triggerCSVExport}
            onCSVUpload={handleCSVUpload}
          />
        )}

        {currentTab === "jobs" && (
          <JobsView
            jobs={jobs}
            onNewJob={() => setCurrentTab("new-job")}
            onCalculate={triggerCalculation}
            onDownloadPDF={downloadPDF}
            onAcknowledgeFlags={acknowledgeJobFlags}
          />
        )}

        {currentTab === "new-job" && (
          <NewJobView
            jobForm={jobForm}
            setJobForm={setJobForm}
            customers={customers}
            vehicleTypes={vehicleTypes}
            drivers={drivers}
            sites={sites}
            onSubmit={handleCreateJob}
            onAddStop={addStopFormRow}
            onBack={() => setCurrentTab("jobs")}
          />
        )}

        {currentTab === "disputes" && (
          <DisputesView
            disputes={disputes}
            activeDispute={activeDispute}
            setActiveDispute={setActiveDispute}
            disputeNotes={disputeNotes}
            setDisputeNotes={setDisputeNotes}
            onResolve={handleResolveDispute}
          />
        )}

        {currentTab === "contracts" && (
          <ContractsView
            contractForm={contractForm}
            setContractForm={setContractForm}
            customers={customers}
            onSave={handleSaveContract}
          />
        )}

        {currentTab === "drivers" && <DriversView drivers={drivers} />}

        {currentTab === "settings" && <SettingsView sites={sites} />}
      </main>
    </div>
  );
}
