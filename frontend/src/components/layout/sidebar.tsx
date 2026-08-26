import { useLocation } from "react-router-dom";

import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROUTES } from "@/lib/constants";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const navItems = [
  { href: ROUTES.DASHBOARD, label: "Dashboard", icon: DashboardIcon },
  { href: ROUTES.PROJECTS, label: "Projects", icon: FolderIcon },
  { href: "/workspace", label: "Workspace", icon: KanbanIcon },
  // Tickets: visible in every mode — the helpdesk is core, not team-only.
  { href: ROUTES.TICKETS, label: "Tickets", icon: TicketIcon },
  { href: ROUTES.VAULT, label: "Vault", icon: VaultIcon },
  { href: ROUTES.STORM, label: "Storm", icon: StormIcon },
  { href: ROUTES.ASSISTANT, label: "Assistant", icon: BotIcon },
  { href: ROUTES.GUIDES, label: "Guides", icon: BookIcon },
  { href: ROUTES.REPORTS, label: "Reports", icon: ChartIcon, teamOnly: true },
  { href: ROUTES.SETTINGS, label: "Settings", icon: SettingsIcon },
];

function Sidebar({
  collapsed,
  onToggle,
  open,
  onOpenChange,
  mode,
}: {
  collapsed: boolean;
  onToggle: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: string;
}) {
  const pathname = useLocation().pathname || "";
  const isMobile = useMobile();
  const { user } = useAuth();

  const displayName = user?.displayName ?? "User";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    await fetch('/api/auth/session', {credentials: "include",  method: 'DELETE' });
    window.location.href = ROUTES.LOGIN;
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 border-b-2 border-outline-strong bg-surface-container-low">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <img
              src="/MKINDAYZIR_logo.jpg"
              alt="Mkindayzir"
              className="h-9 w-9 rounded-none object-cover border-2 border-outline-strong"
            />
            <div className="leading-none">
              <div className="font-display font-extrabold uppercase tracking-tight text-sm text-foreground">
                Mkindayzir
              </div>
              <div className="uppercase-label text-muted-foreground mt-1">
                Ops Control
              </div>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", collapsed && "mx-auto")}
          onClick={onToggle}
        >
          {collapsed ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3H5a2 2 0 0 0-2 2v4" /><path d="M13 3h8a2 2 0 0 1 2 2v4" /><path d="M13 21h5a2 2 0 0 0 2-2v-4" /><path d="M13 21h-8a2 2 0 0 1-2-2v-4" /><rect width="4" height="18" x="5" y="3" /><rect width="4" height="18" x="15" y="3" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3H5a2 2 0 0 0-2 2v4" /><path d="M13 3h8a2 2 0 0 1 2 2v4" /><path d="M13 21h5a2 2 0 0 0 2-2v-4" /><path d="M13 21h-8a2 2 0 0 1-2-2v-4" /><rect width="4" height="18" x="5" y="3" /><rect width="4" height="18" x="15" y="3" /></svg>
          )}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          if (item.teamOnly && mode === "personal") return null;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors font-mono uppercase tracking-wider",
                isActive
                  ? "border-l-primary bg-primary/10 text-primary-light shadow-[inset_0_0_12px_-4px_var(--color-accent-bright)]"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-l-outline",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>
      <div className="border-t border-outline p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3",
                collapsed && "justify-center px-2"
              )}
            >
              <Avatar className="h-8 w-8 border-2 border-outline">
                <AvatarImage src={user?.avatar ?? ""} alt={displayName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">{displayName}</span>
                  <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                    {user?.role ?? "MEMBER"}
                  </span>
                </div>
              )}
              {!collapsed && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto h-4 w-4"><path d="m18 15-6-6-6 6" /></svg>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-64 border-2 border-outline bg-surface p-0">
            <div className="p-3 border-b-2 border-outline">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-outline">
                  <AvatarImage src={user?.avatar ?? ""} alt={displayName} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-display font-extrabold uppercase tracking-tight text-sm">{displayName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{user?.email}</div>
                </div>
              </div>
            </div>
            <div className="p-2 space-y-1">
              <DropdownMenuItem onSelect={() => window.location.href = ROUTES.SETTINGS}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.location.href = ROUTES.SETTINGS}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0-.73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="border-outline my-1" />
              <DropdownMenuItem className="text-destructive" onSelect={handleLogout}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-4 w-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                <span>Log out</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => onOpenChange(false)}
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 transform border-r-2 border-outline bg-surface transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r-2 border-outline-strong bg-surface-container-low transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {sidebarContent}
    </aside>
  );
}

export { Sidebar };

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
  );
}

function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 3H5a2 2 0 0 0-2 2v4" /><path d="M9 3h6a2 2 0 0 1 2 2v4" /><path d="M9 21h6a2 2 0 0 0 2-2v-4" /><path d="M9 21H5a2 2 0 0 1 2-2v-4" /><rect width="4" height="18" x="5" y="3" /><rect width="4" height="18" x="15" y="3" /></svg>
  );
}

function TicketIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></svg>
  );
}

function VaultIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2v4" /><path d="m8 6 4-4 4 4" /><rect width="16" height="16" x="4" y="6" rx="2" /><circle cx="12" cy="14" r="2" /></svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="m19 9-5 5-4-4-3 3" /></svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

function StormIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
  );
}
