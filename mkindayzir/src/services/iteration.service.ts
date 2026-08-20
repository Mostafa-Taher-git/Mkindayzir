import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { IterationRepository } from "@/repositories/iteration.repository";

const iterationRepo = new IterationRepository();

export class IterationService {
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

      return await iterationRepo.findAll(projectId);
    } catch (error) {
      console.error("IterationService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const iteration = await iterationRepo.findById(id);
      if (!iteration) {
        throw { message: "Iteration not found", status: 404 };
      }

      if (user.role !== "ADMIN") {
        const project = await prisma.project.findFirst({
          where: {
            id: iteration.projectId,
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

      return iteration;
    } catch (error) {
      console.error("IterationService.get error:", error);
      throw error;
    }
  }

  async create(
    data: {
      projectId: string;
      name: string;
      goal?: string;
      startDate?: Date;
      endDate?: Date;
    },
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const iteration = await iterationRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "iteration.created",
        resource: "Iteration",
        resourceId: iteration.id,
        details: { name: iteration.name, projectId: iteration.projectId },
      });

      return iteration;
    } catch (error) {
      console.error("IterationService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const iteration = await iterationRepo.findById(id);
      if (!iteration) {
        throw { message: "Iteration not found", status: 404 };
      }

      const updated = await iterationRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "iteration.updated",
        resource: "Iteration",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("IterationService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const iteration = await iterationRepo.findById(id);
      if (!iteration) {
        throw { message: "Iteration not found", status: 404 };
      }

      await iterationRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "iteration.deleted",
        resource: "Iteration",
        resourceId: id,
        details: { name: iteration.name },
      });

      return { success: true };
    } catch (error) {
      console.error("IterationService.delete error:", error);
      throw error;
    }
  }

  async start(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const iteration = await iterationRepo.findById(id);
      if (!iteration) {
        throw { message: "Iteration not found", status: 404 };
      }

      const updated = await iterationRepo.start(id, user.id);

      await audit({
        userId: user.id,
        action: "iteration.started",
        resource: "Iteration",
        resourceId: id,
      });

      return updated;
    } catch (error) {
      console.error("IterationService.start error:", error);
      throw error;
    }
  }

  async complete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const iteration = await iterationRepo.findById(id);
      if (!iteration) {
        throw { message: "Iteration not found", status: 404 };
      }

      const updated = await iterationRepo.complete(id, user.id);

      await audit({
        userId: user.id,
        action: "iteration.completed",
        resource: "Iteration",
        resourceId: id,
      });

      return updated;
    } catch (error) {
      console.error("IterationService.complete error:", error);
      throw error;
    }
  }
}
