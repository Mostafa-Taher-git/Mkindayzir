import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { WorkItemRepository } from "@/repositories/work-item.repository";
import { WorkflowRepository } from "@/repositories/workflow.repository";

const workItemRepo = new WorkItemRepository();
const workflowRepo = new WorkflowRepository();

export class WorkItemService {
  async list(filters: any, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      if (user.role === "VIEWER" && filters.assigneeId && filters.assigneeId !== user.id) {
        throw { message: "Forbidden", status: 403 };
      }

      return await workItemRepo.findAll(filters);
    } catch (error) {
      console.error("WorkItemService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workItem = await workItemRepo.findById(id);
      if (!workItem) {
        throw { message: "Work item not found", status: 404 };
      }
      return workItem;
    } catch (error) {
      console.error("WorkItemService.get error:", error);
      throw error;
    }
  }

  async create(
    data: {
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
      metadata?: Record<string, unknown>;
    },
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("create:work_items");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workItem = await workItemRepo.create({
        ...data,
        reporterId: user.id,
      });

      await audit({
        userId: user.id,
        action: "work_item.created",
        resource: "WorkItem",
        resourceId: workItem.id,
        details: { title: workItem.title, type: workItem.type },
      });

      return workItem;
    } catch (error) {
      console.error("WorkItemService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("edit:work_items");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workItem = await workItemRepo.findById(id);
      if (!workItem) {
        throw { message: "Work item not found", status: 404 };
      }

      const updated = await workItemRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "work_item.updated",
        resource: "WorkItem",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("WorkItemService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("delete:work_items");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workItem = await workItemRepo.findById(id);
      if (!workItem) {
        throw { message: "Work item not found", status: 404 };
      }

      await workItemRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "work_item.deleted",
        resource: "WorkItem",
        resourceId: id,
        details: { title: workItem.title },
      });

      return { success: true };
    } catch (error) {
      console.error("WorkItemService.delete error:", error);
      throw error;
    }
  }

  async transition(id: string, newStatus: string, user: { id: string; role: string }) {
    const auth = await requirePermission("edit:work_items");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workItem = await workItemRepo.findById(id);
      if (!workItem) {
        throw { message: "Work item not found", status: 404 };
      }

      const defaultWorkflow = await workflowRepo.findDefault(workItem.projectId);
      if (defaultWorkflow) {
        const allowed = await workflowRepo.canTransition(
          defaultWorkflow.id,
          workItem.status,
          newStatus
        );
        if (!allowed) {
          throw { message: `Cannot transition from ${workItem.status} to ${newStatus}`, status: 400 };
        }
      }

      const updated = await workItemRepo.transition(id, newStatus, user.id);

      await audit({
        userId: user.id,
        action: "work_item.transitioned",
        resource: "WorkItem",
        resourceId: id,
        details: { from: workItem.status, to: newStatus },
      });

      return updated;
    } catch (error) {
      console.error("WorkItemService.transition error:", error);
      throw error;
    }
  }

  async bulkUpdate(ids: string[], data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("edit:work_items");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      await workItemRepo.bulkUpdate(ids, data, user.id);

      await audit({
        userId: user.id,
        action: "work_item.bulk_updated",
        resource: "WorkItem",
        details: { count: ids.length, data },
      });

      return { success: true, count: ids.length };
    } catch (error) {
      console.error("WorkItemService.bulkUpdate error:", error);
      throw error;
    }
  }

  async getAllowedTransitions(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workItem = await workItemRepo.findById(id);
      if (!workItem) {
        throw { message: "Work item not found", status: 404 };
      }

      const defaultWorkflow = await workflowRepo.findDefault(workItem.projectId);
      if (!defaultWorkflow) {
        return [];
      }

      const transitions = defaultWorkflow.transitions as Record<string, string[]>;
      return transitions[workItem.status] || [];
    } catch (error) {
      console.error("WorkItemService.getAllowedTransitions error:", error);
      throw error;
    }
  }
}
