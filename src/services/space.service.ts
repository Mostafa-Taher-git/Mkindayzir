import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { SpaceRepository } from "@/repositories/space.repository";
import { SpaceRole } from "@/types";

const spaceRepo = new SpaceRepository();

export class SpaceService {
  async list(user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      return await spaceRepo.findAll(user.id);
    } catch (error) {
      console.error("SpaceService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const space = await spaceRepo.findById(id);
      if (!space) {
        throw { message: "Space not found", status: 404 };
      }
      return space;
    } catch (error) {
      console.error("SpaceService.get error:", error);
      throw error;
    }
  }

  async create(data: { name: string; description?: string; visibility?: string }, user: { id: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const space = await spaceRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "space.created",
        resource: "Space",
        resourceId: space.id,
        details: { name: space.name },
      });

      return space;
    } catch (error) {
      console.error("SpaceService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const space = await spaceRepo.findById(id);
      if (!space) {
        throw { message: "Space not found", status: 404 };
      }

      const updated = await spaceRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "space.updated",
        resource: "Space",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("SpaceService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const space = await spaceRepo.findById(id);
      if (!space) {
        throw { message: "Space not found", status: 404 };
      }

      await spaceRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "space.deleted",
        resource: "Space",
        resourceId: id,
        details: { name: space.name },
      });

      return { success: true };
    } catch (error) {
      console.error("SpaceService.delete error:", error);
      throw error;
    }
  }

  async addMember(spaceId: string, userId: string, role: SpaceRole, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const member = await spaceRepo.addMember(spaceId, userId, role);

      await audit({
        userId: user.id,
        action: "space.member_added",
        resource: "Space",
        resourceId: spaceId,
        details: { userId, role },
      });

      return member;
    } catch (error) {
      console.error("SpaceService.addMember error:", error);
      throw error;
    }
  }

  async removeMember(spaceId: string, userId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const result = await spaceRepo.removeMember(spaceId, userId);

      await audit({
        userId: user.id,
        action: "space.member_removed",
        resource: "Space",
        resourceId: spaceId,
        details: { userId },
      });

      return result;
    } catch (error) {
      console.error("SpaceService.removeMember error:", error);
      throw error;
    }
  }
}
