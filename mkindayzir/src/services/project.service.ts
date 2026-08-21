import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { ProjectRepository } from "@/repositories/project.repository";
import { ProjectFilter } from "@/repositories/project.repository";

const projectRepo = new ProjectRepository();

export class ProjectService {
  async list(filters: ProjectFilter, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      return await projectRepo.findAll(filters);
    } catch (error) {
      console.error("ProjectService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const project = await projectRepo.findById(id);
      if (!project) {
        throw { message: "Project not found", status: 404 };
      }
      return project;
    } catch (error) {
      console.error("ProjectService.get error:", error);
      throw error;
    }
  }

  async create(
    data: {
      name: string;
      description?: string;
      leadId?: string;
      teamId?: string;
      key?: string;
    },
    user: { id: string }
  ) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const project = await projectRepo.create({
        ...data,
        createdById: user.id,
      });

      await audit({
        userId: user.id,
        action: "project.created",
        resource: "Project",
        resourceId: project.id,
        details: { name: project.name, key: project.key },
      });

      return project;
    } catch (error) {
      console.error("ProjectService.create error:", error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Record<string, unknown>,
    user: { id: string; role: string }
  ) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const project = await projectRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "project.updated",
        resource: "Project",
        resourceId: id,
        details: data,
      });

      return project;
    } catch (error) {
      console.error("ProjectService.update error:", error);
      throw error;
    }
  }

  async archive(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:projects");
    if (!auth.authorized || !auth.session) return auth.error! as any;;

    try {
      const project = await projectRepo.archive(id, user.id);

      await audit({
        userId: user.id,
        action: "project.archived",
        resource: "Project",
        resourceId: id,
        details: { name: project.name },
      });

      return project;
    } catch (error) {
      console.error("ProjectService.archive error:", error);
      throw error;
    }
  }

  async getStats(id: string) {
    try {
      return await projectRepo.getStats(id);
    } catch (error) {
      console.error("ProjectService.getStats error:", error);
      throw error;
    }
  }
}
