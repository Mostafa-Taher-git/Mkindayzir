import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { WorkflowRepository } from "@/repositories/workflow.repository";

const workflowRepo = new WorkflowRepository();

export class WorkflowService {
  async list(projectId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      if (user.role !== "ADMIN") {
        const project = await prisma.project.findFirst({
          where: {
            id: projectId,
            OR: [
              { createdById: user.id },
              { team: { members: { some: { userId: user.id } } } },
            ],
          },
        });
        if (!project) {
          throw { message: "Forbidden", status: 403 };
        }
      }

      return await workflowRepo.findAll(projectId);
    } catch (error) {
      console.error("WorkflowService.list error:", error);
      throw error;
    }
  }

  async getDefault(projectId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workflow = await workflowRepo.findDefault(projectId);
      if (!workflow) {
        throw { message: "Default workflow not found", status: 404 };
      }
      return workflow;
    } catch (error) {
      console.error("WorkflowService.getDefault error:", error);
      throw error;
    }
  }

  async create(
    data: {
      projectId: string;
      name: string;
      statuses: unknown;
      transitions: unknown;
      isDefault?: boolean;
    },
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workflow = await workflowRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "workflow.created",
        resource: "Workflow",
        resourceId: workflow.id,
        details: { name: workflow.name, projectId: workflow.projectId },
      });

      return workflow;
    } catch (error) {
      console.error("WorkflowService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw { message: "Workflow not found", status: 404 };
      }

      const updated = await workflowRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "workflow.updated",
        resource: "Workflow",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("WorkflowService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const workflow = await workflowRepo.findById(id);
      if (!workflow) {
        throw { message: "Workflow not found", status: 404 };
      }

      await workflowRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "workflow.deleted",
        resource: "Workflow",
        resourceId: id,
        details: { name: workflow.name },
      });

      return { success: true };
    } catch (error) {
      console.error("WorkflowService.delete error:", error);
      throw error;
    }
  }

  async canTransition(workflowId: string, from: string, to: string) {
    try {
      return await workflowRepo.canTransition(workflowId, from, to);
    } catch (error) {
      console.error("WorkflowService.canTransition error:", error);
      throw error;
    }
  }
}
