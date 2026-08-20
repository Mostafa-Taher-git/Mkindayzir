import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import { ProjectStatus } from "@/types";

export type ProjectFilter = {
  status?: ProjectStatus;
  teamId?: string;
  search?: string;
  page?: number;
  perPage?: number;
};

export class ProjectRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.project);
  }

  async findAll(filters: ProjectFilter = {}) {
    try {
      const { status, teamId, search, page = 1, perPage = 20 } = filters;
      const where: Record<string, unknown> = {};

      if (status) where.status = status;
      if (teamId) where.teamId = teamId;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { key: { contains: search, mode: "insensitive" } },
        ];
      }

      const skip = (page - 1) * perPage;
      const [items, total] = await Promise.all([
        prisma.project.findMany({
          where,
          skip,
          take: perPage,
          include: { lead: true, team: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.project.count({ where }),
      ]);

      return { items, total, page, perPage };
    } catch (error) {
      console.error("Failed to find projects:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.project.findUnique({
        where: { id },
        include: {
          lead: true,
          team: true,
          _count: { select: { workItems: true } },
        },
      });
    } catch (error) {
      console.error("Failed to find project by id:", error);
      throw error;
    }
  }

  async create(data: {
    name: string;
    description?: string;
    leadId?: string;
    teamId?: string;
    key?: string;
    createdById: string;
  }) {
    try {
      const key = data.key || this.generateKey(data.name);
      return await prisma.project.create({
        data: {
          name: data.name,
          description: data.description,
          leadId: data.leadId,
          teamId: data.teamId,
          key: key.toUpperCase(),
          createdById: data.createdById,
        },
        include: { lead: true, team: true },
      });
    } catch (error) {
      console.error("Failed to create project:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.project.findUnique({ where: { id } });
      if (!existing) throw new Error("Project not found");

      return await prisma.project.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: { lead: true, team: true },
      });
    } catch (error) {
      console.error("Failed to update project:", error);
      throw error;
    }
  }

  async archive(id: string, userId: string) {
    try {
      return await prisma.project.update({
        where: { id },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
        },
        include: { lead: true, team: true },
      });
    } catch (error) {
      console.error("Failed to archive project:", error);
      throw error;
    }
  }

  async findByKey(key: string) {
    try {
      return await prisma.project.findUnique({
        where: { key: key.toUpperCase() },
        include: { lead: true, team: true },
      });
    } catch (error) {
      console.error("Failed to find project by key:", error);
      throw error;
    }
  }

  async getStats(projectId: string) {
    try {
      const [total, open, closed, backlog] = await Promise.all([
        prisma.workItem.count({ where: { projectId } }),
        prisma.workItem.count({ where: { projectId, status: { not: "done" } } }),
        prisma.workItem.count({ where: { projectId, status: "done" } }),
        prisma.workItem.count({ where: { projectId, iterationId: null } }),
      ]);

      return { total, open, closed, backlog };
    } catch (error) {
      console.error("Failed to get project stats:", error);
      throw error;
    }
  }

  private generateKey(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
  }
}
