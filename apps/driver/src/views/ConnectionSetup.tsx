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
    <div className="mobile-auth">
      <div className="mobile-auth-card">
        <h2>Configure Connection</h2>
        <form onSubmit={onSave} style={{ marginTop: "16px" }}>
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
