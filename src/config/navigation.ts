// src/config/navigation.ts
import { ROUTES } from "@/lib/constants";
import { LayoutDashboard, FolderKanban, Layers, BookOpen, MessageSquare, BarChart3, BookMarked, Users, Settings, Ticket, Milestone } from "lucide-react";

export const navigationItems = [
  { title: "Dashboard", href: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { title: "Projects", href: ROUTES.PROJECTS, icon: FolderKanban },
  { title: "Boards", href: ROUTES.BOARDS, icon: Layers },
  { title: "Tickets", href: ROUTES.TICKETS, icon: Ticket },
  { title: "Vault", href: ROUTES.VAULT, icon: BookOpen },
  { title: "Assistant", href: ROUTES.ASSISTANT, icon: MessageSquare },
  { title: "Reports", href: ROUTES.REPORTS, icon: BarChart3 },
  { title: "Guides", href: ROUTES.GUIDES, icon: BookMarked },
  { title: "Roadmap", href: ROUTES.ROADMAP, icon: Milestone },
];

export const adminNavigationItems = [
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Teams", href: "/admin/teams", icon: Users },
  { title: "Settings", href: "/admin/settings", icon: Settings },
  { title: "Audit", href: "/admin/audit", icon: BarChart3 },
];

export const bottomNavigationItems = [
  { title: "Settings", href: ROUTES.SETTINGS, icon: Settings },
];
