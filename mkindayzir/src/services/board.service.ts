import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class BoardService {
  async list(spaceId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const isMember = await spaceRepo.isMember(spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return await boardRepo.findAll(spaceId);
    } catch (error) {
      console.error("BoardService.list error:", error);
      throw error;
    }
  }

  async listAll(user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      return await boardRepo.findAllForUser(user.id);
    } catch (error) {
      console.error("BoardService.listAll error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const board = await boardRepo.findById(id);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return board;
    } catch (error) {
      console.error("BoardService.get error:", error);
      throw error;
    }
  }

  async create(data: { spaceId: string; name: string; description?: string; background?: string; settings?: Record<string, unknown> }, user: { id: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const isMember = await spaceRepo.isMember(data.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const board = await boardRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "board.created",
        resource: "Board",
        resourceId: board.id,
        details: { name: board.name, spaceId: board.spaceId },
      });

      return board;
    } catch (error) {
      console.error("BoardService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const board = await boardRepo.findById(id);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const updated = await boardRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "board.updated",
        resource: "Board",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("BoardService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const board = await boardRepo.findById(id);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await boardRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "board.deleted",
        resource: "Board",
        resourceId: id,
        details: { name: board.name },
      });

      return { success: true };
    } catch (error) {
      console.error("BoardService.delete error:", error);
      throw error;
    }
  }

  async reorder(spaceId: string, orderedIds: string[], user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const isMember = await spaceRepo.isMember(spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await boardRepo.reorder(spaceId, orderedIds);

      await audit({
        userId: user.id,
        action: "board.reordered",
        resource: "Board",
        resourceId: spaceId,
        details: { orderedIds },
      });

      return { success: true };
    } catch (error) {
      console.error("BoardService.reorder error:", error);
      throw error;
    }
  }
}
