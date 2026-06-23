// Pre-app: 3-step tenant onboarding wizard (company, fleet/terms, customer + rates).
import type React from "react";

interface OnboardingWizardProps {
  wizardStep: number;
  setWizardStep: (n: number) => void;
  onboardingData: any;
  setOnboardingData: (v: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  errorMsg: string;
}

export default function OnboardingWizard({ wizardStep, setWizardStep, onboardingData, setOnboardingData, onSubmit, errorMsg }: OnboardingWizardProps) {
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

        <form onSubmit={onSubmit}>
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
