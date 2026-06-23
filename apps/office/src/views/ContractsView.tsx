// Contracts tab: customer agreement list + creator form (effective/expiry + per-vehicle rules).
import type React from "react";

interface ContractsViewProps {
  contractForm: any;
  setContractForm: (v: any) => void;
  customers: any[];
  onSave: (e: React.FormEvent) => void;
}

export default function ContractsView({ contractForm, setContractForm, customers, onSave }: ContractsViewProps) {
  return (
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
          <form onSubmit={onSave}>
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
  );
}
