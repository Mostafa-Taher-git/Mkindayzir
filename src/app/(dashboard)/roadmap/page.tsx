import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Milestone,
  ExternalLink,
  Shield,
  Bot,
  Globe,
  Radio,
  Layers,
  Sparkles,
  Lock,
  Mail,
  Clock,
  Database,
  Smartphone,
} from "lucide-react";

interface RoadmapItem {
  id: string;
  title: string;
  stage: "portal" | "enterprise" | "ai" | "edge";
  stageLabel: string;
  status: "In Design" | "Planned" | "Research";
  description: string;
  specs: string[];
  icon: any;
}

const ROADMAP_ITEMS: RoadmapItem[] = [
  {
    id: "portal-spa",
    title: "Dedicated Customer Portal SPA",
    stage: "portal",
    stageLabel: "Stage 1 · Support",
    status: "In Design",
    description:
      "A dedicated, isolated customer portal SPA (portal.yourhost or /portal) allowing external customers to register, submit support requests, review tickets, and chat with your team in real time.",
    specs: [
      "Customer model & auth separate from internal staff",
      "Shielded internal notes invisible to customer",
      "Direct ticket submission with drag-and-drop attachments",
    ],
    icon: Globe,
  },
  {
    id: "kb-wiki",
    title: "Public Knowledge Base & Wiki",
    stage: "portal",
    stageLabel: "Stage 1 · Self-Service",
    status: "In Design",
    description:
      "Publish selected runbooks, guides, and documentation notes directly from the Knowledge Vault to a fast, public-facing help center with instant full-text search and feedback voting.",
    specs: [
      "Granular 'Public Note' toggle in Vault",
      "Client-side fuzzy search across public articles",
      "Helpfulness ratings & feedback telemetry",
    ],
    icon: Layers,
  },
  {
    id: "email-inbound",
    title: "Inbound Email Dispatcher",
    stage: "portal",
    stageLabel: "Stage 1 · Channels",
    status: "Planned",
    description:
      "Turn incoming customer emails into support tickets automatically. Deliver instant email notifications for ticket updates, responses, and status changes.",
    specs: [
      "IMAP / POP3 / SendGrid / Mailgun webhook ingestion",
      "Automatic header parsing & customer linking",
      "Rich HTML & Markdown body rendering",
    ],
    icon: Mail,
  },
  {
    id: "sla-engine",
    title: "Automated SLA Enforcement",
    stage: "portal",
    stageLabel: "Stage 1 · Automation",
    status: "Planned",
    description:
      "Define multi-tier SLA targets based on customer tier, priority, and category. Real-time countdowns, warning notifications, and automated escalation to team leads.",
    specs: [
      "Configurable business hours & holiday calendars",
      "Pre-breach warning notifications via WebSocket",
      "SLA compliance reporting & breach analytics",
    ],
    icon: Clock,
  },
  {
    id: "enterprise-sso",
    title: "Enterprise SSO & Directory Sync",
    stage: "enterprise",
    stageLabel: "Stage 2 · Identity",
    status: "Planned",
    description:
      "Connect your organizational identity provider — Google Workspace, Microsoft Entra ID / Azure AD, Okta, or Keycloak — with automated group-to-role provisioning.",
    specs: [
      "SAML 2.0 & OpenID Connect (OIDC) protocols",
      "SCIM 2.0 user lifecycle synchronization",
      "Enforced 2FA & hardware security keys",
    ],
    icon: Lock,
  },
  {
    id: "audit-vault",
    title: "Immutable Audit Vault",
    stage: "enterprise",
    stageLabel: "Stage 2 · Governance",
    status: "Planned",
    description:
      "Append-only cryptographic audit logging tracking all administrative actions, data exports, permission elevations, and configuration changes for SOC 2 and ISO 27001 readiness.",
    specs: [
      "Cryptographic hash chaining on audit logs",
      "One-click CSV/JSON compliance bundle export",
      "Log retention policies & remote syslog streaming",
    ],
    icon: Shield,
  },
  {
    id: "multi-backups",
    title: "Multi-Destination Backups",
    stage: "enterprise",
    stageLabel: "Stage 2 · Storage",
    status: "Planned",
    description:
      "Automate full and incremental backups of SQLite databases, PostgreSQL clusters, and media attachments to S3-compatible storage (MinIO, Wasabi, AWS, Cloudflare R2) and SFTP.",
    specs: [
      "Client-side GPG encryption before upload",
      "Point-in-time recovery (PITR) support",
      "Health checks & automated backup verification",
    ],
    icon: Database,
  },
  {
    id: "ai-copilot",
    title: "AI Auto-Triage & Smart Copilot",
    stage: "ai",
    stageLabel: "Stage 3 · AI Engine",
    status: "Research",
    description:
      "On-premise or encrypted AI assistant that automatically categorizes incoming tickets, estimates priority, suggests relevant knowledge vault solutions, and drafts replies for agent review.",
    specs: [
      "Local Ollama / vLLM or private OpenAI / Anthropic endpoints",
      "Semantic search across entire Knowledge Vault",
      "Strict human-in-the-loop approval mechanism",
    ],
    icon: Bot,
  },
  {
    id: "webhooks-chatops",
    title: "Webhooks & ChatOps Automation",
    stage: "ai",
    stageLabel: "Stage 3 · Integration",
    status: "Research",
    description:
      "Bidirectional webhook engine connecting Mkindayzir with Slack, Discord, Microsoft Teams, GitHub, and custom webhooks for automated task creation and incident alert routing.",
    specs: [
      "HMAC-SHA256 payload signature verification",
      "Configurable event filters & payload transformations",
      "Chat slash-commands for status queries and ticket updates",
    ],
    icon: Radio,
  },
  {
    id: "mobile-pwa",
    title: "Offline Mobile PWA",
    stage: "edge",
    stageLabel: "Stage 4 · Edge",
    status: "Research",
    description:
      "Installable Progressive Web App with background synchronization, IndexedDB caching for full offline work creation, and Web Push notifications for on-call personnel.",
    specs: [
      "Service Worker background sync queue",
      "End-to-end encrypted local offline cache",
      "Push API notifications for assigned tasks and tickets",
    ],
    icon: Smartphone,
  },
];

export default function RoadmapPage() {
  const [filter, setFilter] = useState<string>("all");

  const filteredItems =
    filter === "all" ? ROADMAP_ITEMS : ROADMAP_ITEMS.filter((item) => item.stage === filter);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "In Design":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "Planned":
        return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
      case "Research":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
      default:
        return "";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-power-on">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-outline pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Milestone className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold font-mono">Future Roadmap</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Blueprint of upcoming capabilities, customer portals, enterprise features, and sovereign AI.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/roadmap.html"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-outline hover:border-primary text-xs font-mono text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Standalone HTML Page
          </a>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 border-2 transition-colors ${
            filter === "all"
              ? "bg-primary text-primary-foreground border-primary font-bold"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          All Horizons ({ROADMAP_ITEMS.length})
        </button>
        <button
          onClick={() => setFilter("portal")}
          className={`px-3 py-1.5 border-2 transition-colors ${
            filter === "portal"
              ? "bg-primary text-primary-foreground border-primary font-bold"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          Stage 1 · Customer Portal & Helpdesk
        </button>
        <button
          onClick={() => setFilter("enterprise")}
          className={`px-3 py-1.5 border-2 transition-colors ${
            filter === "enterprise"
              ? "bg-primary text-primary-foreground border-primary font-bold"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          Stage 2 · Enterprise & Compliance
        </button>
        <button
          onClick={() => setFilter("ai")}
          className={`px-3 py-1.5 border-2 transition-colors ${
            filter === "ai"
              ? "bg-primary text-primary-foreground border-primary font-bold"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          Stage 3 · Autonomous AI & ChatOps
        </button>
        <button
          onClick={() => setFilter("edge")}
          className={`px-3 py-1.5 border-2 transition-colors ${
            filter === "edge"
              ? "bg-primary text-primary-foreground border-primary font-bold"
              : "bg-surface border-outline text-muted-foreground hover:text-foreground"
          }`}
        >
          Stage 4 · Edge & Mobile Ops
        </button>
      </div>

      {/* Roadmap Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.id}
              className="border-2 border-outline hover:border-primary/60 transition-all flex flex-col justify-between"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-0.5 border border-outline/60 rounded">
                    {item.stageLabel}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadgeVariant(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <div className="p-2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base font-mono leading-tight">{item.title}</CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground pt-2 leading-relaxed">
                  {item.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="border-t border-outline/50 pt-3 space-y-1.5 font-mono text-[11px] text-muted-foreground">
                  {item.specs.map((spec, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-primary font-bold">›</span>
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Architectural Overview */}
      <Card className="border-2 border-outline bg-muted/20">
        <CardHeader>
          <CardTitle className="text-sm font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Stack Architecture Evolution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-3 border-2 border-outline bg-surface">
              <div className="text-primary font-bold mb-1">01 · OPERATORS</div>
              <div className="font-semibold text-sm">Staff Console</div>
              <p className="text-muted-foreground text-[11px] mt-1">
                Internal management: projects, Kanban boards, sprint tracking, and ticket desk.
              </p>
            </div>
            <div className="p-3 border-2 border-outline bg-surface">
              <div className="text-primary font-bold mb-1">02 · CLIENTS</div>
              <div className="font-semibold text-sm">Customer Portal</div>
              <p className="text-muted-foreground text-[11px] mt-1">
                Dedicated client SPA for issue submission, live message thread, and public knowledge wiki.
              </p>
            </div>
            <div className="p-3 border-2 border-outline bg-surface">
              <div className="text-primary font-bold mb-1">03 · CORE</div>
              <div className="font-semibold text-sm">FastAPI Engine</div>
              <p className="text-muted-foreground text-[11px] mt-1">
                Asynchronous backend with RBAC security, WebSockets, background tasks, and SLA timers.
              </p>
            </div>
            <div className="p-3 border-2 border-outline bg-surface">
              <div className="text-primary font-bold mb-1">04 · STORAGE</div>
              <div className="font-semibold text-sm">Sovereign Data</div>
              <p className="text-muted-foreground text-[11px] mt-1">
                Local-first SQLite or clustered PostgreSQL with encrypted multi-cloud backup automation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
