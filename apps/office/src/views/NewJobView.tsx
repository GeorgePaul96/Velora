// Manual job creation form: job header + dynamic list of stops with timestamps.
import type React from "react";

interface NewJobViewProps {
  jobForm: any;
  setJobForm: (v: any) => void;
  customers: any[];
  vehicleTypes: any[];
  drivers: any[];
  sites: any[];
  onSubmit: (e: React.FormEvent) => void;
  onAddStop: () => void;
  onBack: () => void;
}

export default function NewJobView({ jobForm, setJobForm, customers, vehicleTypes, drivers, sites, onSubmit, onAddStop, onBack }: NewJobViewProps) {
  return (
    <div className="card-panel" style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div className="card-title-bar">
        <h2>Log Waiting Time Job</h2>
        <button className="btn btn-secondary" onClick={onBack}>Back to List</button>
      </div>

      <form onSubmit={onSubmit}>
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
        {jobForm.stops.map((stop: any, index: number) => (
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
          <button type="button" className="btn btn-secondary" onClick={onAddStop}>+ Add stop</button>
          <button type="submit" className="btn btn-success" style={{ marginLeft: "auto" }}>Save & Calculate</button>
        </div>
      </form>
    </div>
  );
}
