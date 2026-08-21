import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { InitiativeRepository } from "@/repositories/initiative.repository";

const initiativeRepo = new InitiativeRepository();

export class InitiativeService {
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

      return await initiativeRepo.findAll(projectId);
    } catch (error) {
      console.error("InitiativeService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const initiative = await initiativeRepo.findById(id);
      if (!initiative) {
        throw { message: "Initiative not found", status: 404 };
      }

      if (user.role !== "ADMIN") {
        const project = await prisma.project.findFirst({
          where: {
            id: initiative.projectId,
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

      return initiative;
    } catch (error) {
      console.error("InitiativeService.get error:", error);
      throw error;
    }
  }

  async create(
    data: {
      projectId: string;
      name: string;
      description?: string;
      startDate?: Date;
      targetDate?: Date;
    },
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const initiative = await initiativeRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "initiative.created",
        resource: "Initiative",
        resourceId: initiative.id,
        details: { name: initiative.name, projectId: initiative.projectId },
      });

      return initiative;
    } catch (error) {
      console.error("InitiativeService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const initiative = await initiativeRepo.findById(id);
      if (!initiative) {
        throw { message: "Initiative not found", status: 404 };
      }

      const updated = await initiativeRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "initiative.updated",
        resource: "Initiative",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("InitiativeService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const initiative = await initiativeRepo.findById(id);
      if (!initiative) {
        throw { message: "Initiative not found", status: 404 };
      }

      await initiativeRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "initiative.deleted",
        resource: "Initiative",
        resourceId: id,
        details: { name: initiative.name },
      });

      return { success: true };
    } catch (error) {
      console.error("InitiativeService.delete error:", error);
      throw error;
    }
  }

  async recalculateProgress(id: string) {
    try {
      return await initiativeRepo.updateProgress(id);
    } catch (error) {
      console.error("InitiativeService.recalculateProgress error:", error);
      throw error;
    }
  }
}
