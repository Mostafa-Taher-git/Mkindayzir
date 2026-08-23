import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import { WorkItemStatus, WorkItemFilter } from "@/types";

export class WorkItemRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.workItem);
  }

  async findAll(filters: WorkItemFilter = {}) {
    try {
      const {
        projectId,
        status,
        assigneeId,
        iterationId,
        priority,
        type,
        search,
        page = 1,
        perPage = 20,
      } = filters;

      const where: Record<string, unknown> = {};
      if (projectId) where.projectId = projectId;
      if (status) where.status = status;
      if (assigneeId) where.assigneeId = assigneeId;
      if (iterationId) where.iterationId = iterationId;
      if (priority) where.priority = priority;
      if (type) where.type = type;
      if (search) {
        where.OR = [
          { title: { contains: search } },
          { description: { contains: search } },
        ];
      }

      const skip = (page - 1) * perPage;
      const [items, total] = await Promise.all([
        prisma.workItem.findMany({
          where,
          skip,
          take: perPage,
          include: {
            project: { select: { id: true, key: true, name: true } },
            assignee: { select: { id: true, displayName: true, email: true } },
            reporter: { select: { id: true, displayName: true, email: true } },
            iteration: true,
            initiative: true,
            labels: { include: { label: true } },
            parent: { select: { id: true, title: true, number: true } },
          },
          orderBy: { position: "asc" },
        }),
        prisma.workItem.count({ where }),
      ]);

      return { items, total, page, perPage };
    } catch (error) {
      console.error("Failed to find work items:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.workItem.findUnique({
        where: { id },
        include: {
          project: true,
          assignee: true,
          reporter: true,
          iteration: true,
          initiative: true,
          labels: { include: { label: true } },
          children: { orderBy: { position: "asc" } },
          parent: true,
        },
      });
    } catch (error) {
      console.error("Failed to find work item by id:", error);
      throw error;
    }
  }

  async create(data: {
    projectId: string;
    title: string;
    description?: string;
    type: string;
    priority?: string;
    assigneeId?: string;
    initiativeId?: string;
    iterationId?: string;
    parentId?: string;
    storyPoints?: number;
    dueDate?: Date;
    reporterId: string;
  }) {
    try {
      const number = await this.getNextNumber(data.projectId);
      return await prisma.workItem.create({
        data: {
          projectId: data.projectId,
          number,
          title: data.title,
          description: data.description,
          type: data.type as any,
          priority: data.priority as any || "MEDIUM",
          assigneeId: data.assigneeId,
          reporterId: data.reporterId,
          initiativeId: data.initiativeId,
          iterationId: data.iterationId,
          parentId: data.parentId,
          storyPoints: data.storyPoints,
          dueDate: data.dueDate,
          status: "todo",
        },
        include: {
          project: true,
          assignee: true,
          reporter: true,
          iteration: true,
          initiative: true,
          labels: { include: { label: true } },
          parent: true,
        },
      });
    } catch (error) {
      console.error("Failed to create work item:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.workItem.findUnique({ where: { id } });
      if (!existing) throw new Error("Work item not found");

      const updateData: Record<string, unknown> = { ...data };
      if (updateData.status === "done" && !existing.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
      if (existing.status === "done" && updateData.status !== "done") {
        updateData.resolvedAt = null;
      }

      return await prisma.workItem.update({
        where: { id },
        data: updateData,
        include: {
          project: true,
          assignee: true,
          reporter: true,
          iteration: true,
          initiative: true,
          labels: { include: { label: true } },
          parent: true,
        },
      });
    } catch (error) {
      console.error("Failed to update work item:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.workItem.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to delete work item:", error);
      throw error;
    }
  }

  async transition(id: string, newStatus: string, userId: string) {
    try {
      const existing = await prisma.workItem.findUnique({ where: { id } });
      if (!existing) throw new Error("Work item not found");

      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === "done" && !existing.resolvedAt) {
        updateData.resolvedAt = new Date();
      }

      const updated = await prisma.workItem.update({
        where: { id },
        data: updateData,
        include: {
          project: true,
          assignee: true,
          reporter: true,
          iteration: true,
          initiative: true,
          labels: { include: { label: true } },
          parent: true,
        },
      });

      await prisma.activity.create({
        data: {
          entityType: "WorkItem",
          entityId: id,
          userId,
          action: "status_changed",
          changes: JSON.stringify({
            from: existing.status,
            to: newStatus,
          }),
        },
      });

      return updated;
    } catch (error) {
      console.error("Failed to transition work item:", error);
      throw error;
    }
  }

  async getNextNumber(projectId: string) {
    try {
      const result = await prisma.workItem.aggregate({
        where: { projectId },
        _max: { number: true },
      });
      return (result._max.number || 0) + 1;
    } catch (error) {
      console.error("Failed to get next work item number:", error);
      throw error;
    }
  }

  async bulkUpdate(ids: string[], data: Record<string, unknown>, userId: string) {
    try {
      return await prisma.workItem.updateMany({
        where: { id: { in: ids } },
        data: { ...data, updatedAt: new Date() },
      });
    } catch (error) {
      console.error("Failed to bulk update work items:", error);
      throw error;
    }
  }

  async findByIteration(iterationId: string) {
    try {
      return await prisma.workItem.findMany({
        where: { iterationId },
        include: {
          project: true,
          assignee: true,
          reporter: true,
          iteration: true,
          initiative: true,
          labels: { include: { label: true } },
          parent: true,
        },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find work items by iteration:", error);
      throw error;
    }
  }

  async findBacklog(projectId: string) {
    try {
      return await prisma.workItem.findMany({
        where: { projectId, iterationId: null },
        include: {
          project: true,
          assignee: true,
          reporter: true,
          iteration: true,
          initiative: true,
          labels: { include: { label: true } },
          parent: true,
        },
        orderBy: { position: "asc" },
      });
    } catch (error) {
      console.error("Failed to find backlog work items:", error);
      throw error;
    }
  }
}
