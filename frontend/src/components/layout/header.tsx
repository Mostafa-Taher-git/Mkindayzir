import { useLocation, useNavigate } from "react-router-dom";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROUTES } from "@/lib/constants";
import { useMobile } from "@/hooks/use-mobile";
import { ConnectionStatus } from "@/components/shared/connection-status";

const routeLabels: Record<string, string> = {
  [ROUTES.DASHBOARD]: "Dashboard",
  [ROUTES.PROJECTS]: "Projects",
  [ROUTES.BOARDS]: "Boards",
  [ROUTES.VAULT]: "Vault",
  [ROUTES.ASSISTANT]: "Assistant",
  [ROUTES.GUIDES]: "Guides",
  [ROUTES.REPORTS]: "Reports",
  [ROUTES.SETTINGS]: "Settings",
  [ROUTES.ADMIN]: "Admin",
};

function Header({
  onMenuClick,
  onSearchClick,
}: {
  onMenuClick: () => void;
  onSearchClick: () => void;
}) {
  const pathname = useLocation().pathname || "";
  const navigate = useNavigate();
  const isMobile = useMobile();
  const { user } = useAuth();
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const notifRef = React.useRef<HTMLDivElement>(null);
  const profileRef = React.useRef<HTMLDivElement>(null);

  const displayName = user?.displayName ?? "User";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    await fetch("/api/auth/session", {credentials: "include",  method: "DELETE" });
    window.location.href = ROUTES.LOGIN;
  };

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (notifOpen || profileOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen, profileOpen]);

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = routeLabels[href] || segment.charAt(0).toUpperCase() + segment.slice(1);
    return { href, label };
  });

  return (
    <header className="flex h-14 items-center justify-between border-b-2 border-outline bg-surface px-4">
      <div className="flex items-center gap-4">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onMenuClick}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16" /><path d="M4 18h16" /><path d="M4 6h16" /></svg>
          </Button>
        )}
        <div className="flex items-center gap-3">
          <img
            src="/MKINDAYZIR_logo.jpg"
            alt="Mkindayzir"
            className="h-8 w-auto object-contain"
          />
        </div>
        <nav className="flex items-center gap-2 text-sm text-muted-foreground font-mono uppercase tracking-wider">
          <a href={ROUTES.DASHBOARD} className="hover:text-foreground">
            Home
          </a>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.href}>
              <span className="text-muted-foreground/50">/</span>
              <a
                href={crumb.href}
                className="hover:text-foreground"
              >
                {crumb.label}
              </a>
            </React.Fragment>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearchClick}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </Button>
        <ThemeToggle />
        <ConnectionStatus />

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setNotifOpen(!notifOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-destructive border border-outline" />
          </Button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 border-2 border-outline bg-surface shadow-panel z-50">
              <div className="flex items-center justify-between border-b-2 border-outline p-3">
                <span className="font-display text-sm font-extrabold uppercase tracking-tight">Notifications</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNotifOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </Button>
              </div>
              <div className="p-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-muted-foreground/40"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">Activity from your projects will appear here</p>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="relative" ref={profileRef}>
          <Button
            variant="ghost"
            className="relative h-8 w-8 border-2 border-outline"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatar ?? ""} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 border-2 border-outline bg-surface shadow-panel z-50">
              <div className="flex items-center justify-between border-b-2 border-outline p-3">
                <span className="font-display text-sm font-extrabold uppercase tracking-tight">Profile</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setProfileOpen(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </Button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="h-12 w-12 border-2 border-outline">
                    <AvatarImage src={user?.avatar ?? ""} alt={displayName} />
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-display font-extrabold uppercase tracking-tight text-sm">{displayName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{user?.email}</div>
                  </div>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground uppercase tracking-wider">Role</span>
                    <span className="font-bold">{user?.role ?? "MEMBER"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground uppercase tracking-wider">Status</span>
                    <span className="font-bold">{user?.status ?? "ACTIVE"}</span>
                  </div>
                  {user?.timezone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground uppercase tracking-wider">Timezone</span>
                      <span className="font-bold">{user.timezone}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-2 border-outline"
                    onClick={() => { navigate(ROUTES.SETTINGS); setProfileOpen(false); }}
                  >
                    Settings
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { handleLogout(); setProfileOpen(false); }}
                  >
                    Log out
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export { Header };

function ThemeToggle() {
  const [theme, setTheme] = React.useState<"light" | "dark">("dark");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem("mkindayzir-theme");
    // Light is the default theme (user decision); dark stays available.
    const initial = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(initial);
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("mkindayzir-theme", theme);
  }, [theme, mounted]);

  const toggle = () => setTheme(theme === "light" ? "dark" : "light");

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
      {theme === "light" ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      )}
    </Button>
  );
}
