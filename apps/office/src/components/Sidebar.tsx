// Left navigation rail: tab switcher + signed-in identity + sign-out.
import { Icons } from "./icons";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  userName: string;
  tenantName: string;
  onSignOut: () => void;
}

export default function Sidebar({ currentTab, setCurrentTab, userName, tenantName, onSignOut }: SidebarProps) {
  return (
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
          Signed in: {userName} <br /> ({tenantName})
        </div>
        <div className="nav-item" onClick={onSignOut}>
          <Icons.LogOut /> Log Out
        </div>
      </div>
    </nav>
  );
}
