// Pre-auth: capture Supabase URL + anon key (stored in localStorage) when no env config is present.
import type React from "react";

interface ConnectionSetupProps {
  supabaseUrl: string;
  setSupabaseUrl: (v: string) => void;
  supabaseAnonKey: string;
  setSupabaseAnonKey: (v: string) => void;
  onSave: (e: React.FormEvent) => void;
}

export default function ConnectionSetup({ supabaseUrl, setSupabaseUrl, supabaseAnonKey, setSupabaseAnonKey, onSave }: ConnectionSetupProps) {
  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Connect WTR Platform</h2>
          <p className="auth-subtitle">Configure Supabase connection parameters for local execution.</p>
        </div>
        <form onSubmit={onSave}>
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
