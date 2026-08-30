import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  useWorkspace,
  useWorkspaceSetter,
  useMyOrg,
} from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const active = useWorkspace();
  const setActive = useWorkspaceSetter();
  const { data, isLoading } = useMyOrg();
  const orgs = data?.organizations ?? [];
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const [search, setSearch] = React.useState("");

  React.useEffect(() => { setOpen(false); }, [location.pathname]);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = active.type === "personal" ? "Personal" : active.orgName || "Organization";
  const sub = active.type === "personal"
    ? "Private to you"
    : `${active.orgType === "enterprise" ? "Enterprise" : "Team"} · ${active.role}`;
  const dot = active.type === "personal" ? "bg-zinc-500" : "bg-blue-500";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-md border border-outline bg-background/40 px-2.5 py-2 hover:border-primary transition-colors"
      >
        <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} aria-hidden />
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-sm font-medium truncate">{label}</span>
          <span className="block text-[10px] text-muted-foreground truncate">{sub}</span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto shrink-0 text-muted-foreground"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border border-outline bg-surface shadow-lg p-1">
          <SwitcherItem
            active={active.type === "personal"}
            onClick={() => setActive({ type: "personal" })}
            label="Personal"
            sub="Private to you"
            dotClass="bg-zinc-500"
          />
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : null}
          {orgs
            .filter((o) => !search || o.orgName.toLowerCase().includes(search.toLowerCase()))
            .map((o) => (
              <SwitcherItem
                key={o.orgId}
                active={active.type === "org" && active.orgId === o.orgId}
                onClick={() => setActive({
                  type: "org",
                  orgId: o.orgId,
                  orgName: o.orgName,
                  orgType: o.orgType,
                  role: o.role,
                })}
                label={o.orgName}
                sub={`${o.orgType === "enterprise" ? "Enterprise" : "Team"} · ${o.role}`}
                dotClass="bg-blue-500"
              />
            ))}
          <div className="border-t border-outline my-1" />
          <Link
            to="/settings"
            className="block px-3 py-2 text-sm rounded hover:bg-accent text-foreground no-underline"
          >
            <span className="flex items-center gap-2">
              <SettingsIcon />
              {active.type === "org" ? "Organization settings" : "Settings"}
            </span>
          </Link>
          <StartOrgLink label="Start a Team" />
          <StartOrgLink label="Start an Enterprise" />
        </div>
      )}
    </div>
  );
}

function StartOrgLink({ label }: { label: string }) {
  return (
    <Link
      to="/settings"
      className="block px-3 py-2 text-sm rounded hover:bg-accent text-foreground no-underline"
    >
      <span className="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        {label}
      </span>
    </Link>
  );
}

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2 2-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20h-2v-.09A1.65 1.65 0 0 0 12 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2-2 .06-.06A1.65 1.65 0 0 0 8.51 15a1.65 1.65 0 0 0-1.51-1H7v-2h.09A1.65 1.65 0 0 0 8.6 11a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2-2 .06.06A1.65 1.65 0 0 0 12 7.51a1.65 1.65 0 0 0 1-1.51V6h2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2 2-.06.06A1.65 1.65 0 0 0 19.49 11c.62.25 1.04.86 1.04 1.53v1A1.65 1.65 0 0 0 19.4 15Z" />
    </svg>
  );
}

function SwitcherItem({
  active, onClick, label, sub, dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  dotClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{label}</span>
        <span className="block text-[10px] text-muted-foreground truncate">{sub}</span>
      </span>
      {active && (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
