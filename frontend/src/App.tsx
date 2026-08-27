import { ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useConfig } from "@/hooks/use-config";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import SetupPage from "@/app/(auth)/setup/page";

import DashboardPage from "@/app/(dashboard)/dashboard/page";
import ProjectsPage from "@/app/(dashboard)/projects/page";
import NewProjectPage from "@/app/(dashboard)/projects/new/page";
import ProjectDetailPage from "@/app/(dashboard)/projects/[projectId]/page";
import SpacesPage from "@/app/(dashboard)/spaces/page";
import NewSpacePage from "@/app/(dashboard)/spaces/new/page";
import SpaceDetailPage from "@/app/(dashboard)/spaces/[spaceId]/page";
import NewBoardPage from "@/app/(dashboard)/spaces/[spaceId]/boards/new/page";
import BoardsPage from "@/app/(dashboard)/boards/page";
import WorkspacePage from "@/app/(dashboard)/workspace/page";
import BoardDetailPage from "@/app/(dashboard)/boards/[boardId]/page";
import CardDetailPage from "@/app/(dashboard)/cards/[cardId]/page";
import VaultPage from "@/app/(dashboard)/vault/page";
import NewNotePage from "@/app/(dashboard)/vault/notes/new/page";
import VaultNotePage from "@/app/(dashboard)/vault/notes/[noteId]/page";
import EditNotePage from "@/app/(dashboard)/vault/notes/[noteId]/edit/page";
import VaultFolderPage from "@/app/(dashboard)/vault/folders/[folderId]/page";
import VaultTagsPage from "@/app/(dashboard)/vault/tags/page";
import VaultGraphPage from "@/app/(dashboard)/vault/graph/page";
import VaultArchivePage from "@/app/(dashboard)/vault/archive/page";
import VaultArchiveFolderPage from "@/app/(dashboard)/vault/archive/[folderId]/page";
import AssistantPage from "@/app/(dashboard)/assistant/page";
import ConversationPage from "@/app/(dashboard)/assistant/[conversationId]/page";
import TicketsPage from "@/app/(dashboard)/tickets/page";
import NewTicketPage from "@/app/(dashboard)/tickets/new/page";
import TicketDetailPage from "@/app/(dashboard)/tickets/[ticketId]/page";
import GuidesPage from "@/app/(dashboard)/guides/page";
import ReportsPage from "@/app/(dashboard)/reports/page";
import RoadmapPage from "@/app/(dashboard)/roadmap/page";
import SettingsPage from "@/app/(dashboard)/settings/page";
import SystemSettingsPage from "@/app/(dashboard)/settings/system/page";
import { ErrorBoundary } from "@/components/ui/error-boundary";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono uppercase tracking-wider text-muted-foreground">
        Initializing console...
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function DashboardRoute({ children }: { children: ReactNode }) {
  const { mode } = useConfig();
  return <DashboardLayout mode={mode}>{children}</DashboardLayout>;
}

export default function App() {
  return (
    <Routes>
      {/* Public / auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/setup" element={<SetupPage />} />

      {/* Protected dashboard routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <DashboardPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <ProjectsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <NewProjectPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <ProjectDetailPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/spaces"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <SpacesPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/spaces/new"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <NewSpacePage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/spaces/:spaceId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <SpaceDetailPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/spaces/:spaceId/boards/new"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <NewBoardPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <WorkspacePage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/boards"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <BoardsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/boards/:boardId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <BoardDetailPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <TicketsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <NewTicketPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:ticketId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <TicketDetailPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cards/:cardId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <CardDetailPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/archive"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultArchivePage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/archive/:folderId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultArchiveFolderPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/notes/new"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <NewNotePage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/notes/:noteId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultNotePage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/notes/:noteId/edit"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <EditNotePage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/folders/:folderId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultFolderPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/tags"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultTagsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault/graph"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <VaultGraphPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assistant"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <AssistantPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assistant/:conversationId"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <ConversationPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/guides"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <GuidesPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <ReportsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/roadmap"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <RoadmapPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <SettingsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/system"
        element={
          <ProtectedRoute>
            <DashboardRoute>
              <SystemSettingsPage />
            </DashboardRoute>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
