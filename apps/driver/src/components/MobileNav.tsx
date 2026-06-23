// Bottom tab bar: Jobs / Sync, with pending-events badge.
import { Icons } from "./icons";

interface MobileNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  pendingEventsCount: number;
}

export default function MobileNav({ currentTab, setCurrentTab, pendingEventsCount }: MobileNavProps) {
  return (
    <footer className="bottom-nav">
      <div className={`nav-tab ${currentTab === "jobs" ? "active" : ""}`} onClick={() => setCurrentTab("jobs")}>
        <Icons.Jobs className="nav-tab-icon" />
        <span>Jobs</span>
      </div>
      <div className={`nav-tab ${currentTab === "sync" ? "active" : ""}`} onClick={() => setCurrentTab("sync")}>
        <Icons.Dashboard className="nav-tab-icon" style={{ transform: "rotate(45deg)" }} />
        <span>Sync ({pendingEventsCount})</span>
      </div>
    </footer>
  );
}
