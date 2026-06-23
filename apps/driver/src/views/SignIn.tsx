// Pre-auth: driver magic-link sign-in plus a sandbox demo login.
interface SignInProps {
  errorMsg: string;
  successMsg: string;
  onSignIn: (email: string, mode: "magic" | "demo") => void;
}

export default function SignIn({ errorMsg, successMsg, onSignIn }: SignInProps) {
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
          onSignIn(email, "magic");
        }}>Request Link</button>

        <div style={{ textAlign: "center", margin: "16px 0", fontSize: "12px", color: "var(--text-secondary)" }}>— OR —</div>

        <button className="giant-btn" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)", color: "#FFF" }} onClick={() => onSignIn("", "demo")}>
          Sign In with Sandbox Demo
        </button>
      </div>
    </div>
  );
}
