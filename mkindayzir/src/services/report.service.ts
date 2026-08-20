import prisma from "@/lib/prisma";
import { requirePermission, PERMISSIONS } from "@/lib/rbac";

function authError(result: { authorized: boolean; error?: any }) {
  if (!result.authorized && result.error) {
    throw result.error;
  }
  return result;
}

export class ReportService {
  async getDashboardSummary(userId: string, user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const [totalProjects, openWorkItems, assignedToMe, overdueItems] = await Promise.all([
        prisma.project.count({ where: { status: "ACTIVE" } }),
        prisma.workItem.count({ where: { status: { not: "done" } } }),
        prisma.workItem.count({ where: { assigneeId: userId, status: { not: "done" } } }),
        prisma.workItem.count({
          where: {
            status: { not: "done" },
            dueDate: { lt: new Date() },
          },
        }),
      ]);

      return { totalProjects, openWorkItems, assignedToMe, overdueItems };
    } catch (error) {
      console.error("ReportService.getDashboardSummary error:", error);
      throw error;
    }
  }

  async getWorkloadReport(user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const workItems = await prisma.workItem.findMany({
        where: { status: { not: "done" }, assigneeId: { not: null } },
        include: {
          assignee: { select: { id: true, displayName: true, email: true } },
          project: { select: { id: true, key: true, name: true } },
        },
      });

      const grouped = workItems.reduce<Record<string, { assignee: { id: string; displayName: string; email: string }; items: typeof workItems }>>((acc, item) => {
        const assigneeId = item.assigneeId!;
        if (!acc[assigneeId]) {
          acc[assigneeId] = {
            assignee: {
              id: item.assignee!.id,
              displayName: item.assignee!.displayName,
              email: item.assignee!.email,
            },
            items: [],
          };
        }
        acc[assigneeId].items.push(item);
        return acc;
      }, {});

      return Object.values(grouped).map((group) => ({
        ...group,
        count: group.items.length,
      }));
    } catch (error) {
      console.error("ReportService.getWorkloadReport error:", error);
      throw error;
    }
  }

  async getVelocityReport(user: { id: string; role: string }, projectId?: string) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const where: Record<string, unknown> = {
        status: "done",
        iterationId: { not: null },
      };

      if (projectId) {
        where.projectId = projectId;
      }

      const workItems = await prisma.workItem.findMany({
        where,
        include: {
          iteration: { select: { id: true, name: true, startDate: true, endDate: true } },
          project: { select: { id: true, key: true, name: true } },
        },
      });

      const grouped = workItems.reduce<Record<string, { iteration: { id: string; name: string; startDate: string; endDate: string }; totalPoints: number; count: number }>>((acc, item) => {
        if (!item.iterationId) return acc;
        if (!acc[item.iterationId]) {
          acc[item.iterationId] = {
            iteration: {
              id: item.iteration!.id,
              name: item.iteration!.name,
              startDate: item.iteration!.startDate!.toISOString(),
              endDate: item.iteration!.endDate!.toISOString(),
            },
            totalPoints: 0,
            count: 0,
          };
        }
        acc[item.iterationId].totalPoints += item.storyPoints ?? 0;
        acc[item.iterationId].count += 1;
        return acc;
      }, {});

      return Object.values(grouped);
    } catch (error) {
      console.error("ReportService.getVelocityReport error:", error);
      throw error;
    }
  }

  async getTrendReport(user: { id: string; role: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [createdItems, resolvedItems] = await Promise.all([
        prisma.workItem.findMany({
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          select: {
            createdAt: true,
          },
        }),
        prisma.workItem.findMany({
          where: {
            status: "done",
            resolvedAt: { gte: thirtyDaysAgo },
          },
          select: {
            resolvedAt: true,
          },
        }),
      ]);

      const daily: Record<string, { date: string; created: number; resolved: number }> = {};

      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        daily[key] = { date: key, created: 0, resolved: 0 };
      }

      createdItems.forEach((item) => {
        const key = item.createdAt.toISOString().split("T")[0];
        if (daily[key]) {
          daily[key].created += 1;
        }
      });

      resolvedItems.forEach((item) => {
        if (item.resolvedAt) {
          const key = item.resolvedAt.toISOString().split("T")[0];
          if (daily[key]) {
            daily[key].resolved += 1;
          }
        }
      });

      return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error("ReportService.getTrendReport error:", error);
      throw error;
    }
  }

  async exportCSV(user: { id: string; role: string }, filters?: { projectId?: string; status?: string }) {
    const auth = await requirePermission(PERMISSIONS.VIEW_DASHBOARD);
    authError(auth);

    try {
      const where: Record<string, unknown> = {};
      if (filters?.projectId) where.projectId = filters.projectId;
      if (filters?.status) where.status = filters.status;

      const workItems = await prisma.workItem.findMany({
        where,
        include: {
          project: { select: { key: true, name: true } },
          assignee: { select: { displayName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const headers = ["ID", "Title", "Type", "Status", "Priority", "Assignee", "Project", "Created At"];
      const rows = workItems.map((item) => [
        item.id,
        `"${item.title.replace(/"/g, '""')}"`,
        item.type,
        item.status,
        item.priority,
        `"${(item.assignee?.displayName || "").replace(/"/g, '""')}"`,
        `"${item.project?.key || ""}"`,
        item.createdAt.toISOString(),
      ]);

      const csv = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      return csv;
    } catch (error) {
      console.error("ReportService.exportCSV error:", error);
      throw error;
    }
  }
}
