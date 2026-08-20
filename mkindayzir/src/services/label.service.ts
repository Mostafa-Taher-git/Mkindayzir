import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { LabelRepository } from "@/repositories/label.repository";

const labelRepo = new LabelRepository();

export class LabelService {
  async list(projectId: string) {
    try {
      return await labelRepo.findAll(projectId);
    } catch (error) {
      console.error("LabelService.list error:", error);
      throw error;
    }
  }

  async get(id: string) {
    try {
      return await labelRepo.findById(id);
    } catch (error) {
      console.error("LabelService.get error:", error);
      throw error;
    }
  }

  async create(data: { projectId: string; name: string; color: string }, user: { id: string }) {
    try {
      const label = await labelRepo.create(data, user.id);
      return label;
    } catch (error) {
      console.error("LabelService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string }) {
    try {
      const label = await labelRepo.update(id, data, user.id);
      return label;
    } catch (error) {
      console.error("LabelService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string }) {
    try {
      await labelRepo.delete(id, user.id);
      return { success: true };
    } catch (error) {
      console.error("LabelService.delete error:", error);
      throw error;
    }
  }
}
