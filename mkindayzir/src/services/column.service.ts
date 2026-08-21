import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { ColumnRepository } from "@/repositories/column.repository";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const columnRepo = new ColumnRepository();
const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class ColumnService {
  async list(boardId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const board = await boardRepo.findById(boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return await columnRepo.findAll(boardId);
    } catch (error) {
      console.error("ColumnService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const column = await columnRepo.findById(id);
      if (!column) {
        throw { message: "Column not found", status: 404 };
      }

      const board = await boardRepo.findById(column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return column;
    } catch (error) {
      console.error("ColumnService.get error:", error);
      throw error;
    }
  }

  async create(data: { boardId: string; name: string; limit?: number }, user: { id: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const board = await boardRepo.findById(data.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const column = await columnRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "column.created",
        resource: "Column",
        resourceId: column.id,
        details: { name: column.name, boardId: column.boardId },
      });

      return column;
    } catch (error) {
      console.error("ColumnService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const column = await columnRepo.findById(id);
      if (!column) {
        throw { message: "Column not found", status: 404 };
      }

      const board = await boardRepo.findById(column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const updated = await columnRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "column.updated",
        resource: "Column",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("ColumnService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const column = await columnRepo.findById(id);
      if (!column) {
        throw { message: "Column not found", status: 404 };
      }

      const board = await boardRepo.findById(column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await columnRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "column.deleted",
        resource: "Column",
        resourceId: id,
        details: { name: column.name },
      });

      return { success: true };
    } catch (error) {
      console.error("ColumnService.delete error:", error);
      throw error;
    }
  }

  async reorder(boardId: string, orderedIds: string[], user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const board = await boardRepo.findById(boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await columnRepo.reorder(boardId, orderedIds);

      await audit({
        userId: user.id,
        action: "column.reordered",
        resource: "Column",
        resourceId: boardId,
        details: { orderedIds },
      });

      return { success: true };
    } catch (error) {
      console.error("ColumnService.reorder error:", error);
      throw error;
    }
  }
}
