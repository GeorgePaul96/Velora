// Pre-auth: email magic-link sign-in plus a sandbox demo login.
interface AuthLandingProps {
  errorMsg: string;
  successMsg: string;
  onAuth: (email: string, mode: "magic" | "demo") => void;
}

export default function AuthLanding({ errorMsg, successMsg, onAuth }: AuthLandingProps) {
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
          onAuth(email, "magic");
        }}>Send Magic Link</button>

        <div style={{ textAlign: "center", margin: "12px 0", fontSize: "12px", color: "var(--text-muted)" }}>— OR —</div>

        <button className="btn btn-secondary" style={{ width: "100%", borderColor: "var(--success-border)" }} onClick={() => onAuth("", "demo")}>
          Sign In with Sandbox Demo
        </button>
      </div>
    </div>
  );
}
