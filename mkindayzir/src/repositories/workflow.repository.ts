import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class WorkflowRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.workflow);
  }

  async findAll(projectId: string) {
    try {
      return await prisma.workflow.findMany({
        where: { projectId },
        include: { project: true },
        orderBy: { name: "asc" },
      });
    } catch (error) {
      console.error("Failed to find workflows:", error);
      throw error;
    }
  }

  async findDefault(projectId: string) {
    try {
      return await prisma.workflow.findFirst({
        where: { projectId, isDefault: true },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to find default workflow:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      return await prisma.workflow.findUnique({
        where: { id },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to find workflow by id:", error);
      throw error;
    }
  }

  async create(data: {
    projectId: string;
    name: string;
    statuses: unknown;
    transitions: unknown;
    isDefault?: boolean;
  }, userId: string) {
    try {
      return await prisma.workflow.create({
        data: {
          projectId: data.projectId,
          name: data.name,
          statuses: data.statuses as any,
          transitions: data.transitions as any,
          isDefault: data.isDefault || false,
        },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to create workflow:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    try {
      const existing = await prisma.workflow.findUnique({ where: { id } });
      if (!existing) throw new Error("Workflow not found");

      return await prisma.workflow.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
        include: { project: true },
      });
    } catch (error) {
      console.error("Failed to update workflow:", error);
      throw error;
    }
  }

  async delete(id: string, userId: string) {
    try {
      return await prisma.workflow.delete({
        where: { id },
      });
    } catch (error) {
      console.error("Failed to delete workflow:", error);
      throw error;
    }
  }

  async canTransition(workflowId: string, fromStatus: string, toStatus: string) {
    try {
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        select: { transitions: true },
      });

      if (!workflow) return false;

      const transitions = workflow.transitions as Record<string, string[]>;
      const allowed = transitions[fromStatus] || [];
      return allowed.includes(toStatus);
    } catch (error) {
      console.error("Failed to check transition:", error);
      throw error;
    }
  }
}
