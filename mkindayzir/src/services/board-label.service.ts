import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { BoardLabelRepository } from "@/repositories/board-label.repository";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const boardLabelRepo = new BoardLabelRepository();
const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class BoardLabelService {
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

      return await boardLabelRepo.findAll(boardId);
    } catch (error) {
      console.error("BoardLabelService.list error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const label = await boardLabelRepo.findById(id);
      if (!label) {
        throw { message: "Label not found", status: 404 };
      }

      const board = await boardRepo.findById(label.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return label;
    } catch (error) {
      console.error("BoardLabelService.get error:", error);
      throw error;
    }
  }

  async create(data: { boardId: string; name: string; color: string }, user: { id: string }) {
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

      const label = await boardLabelRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "board_label.created",
        resource: "BoardLabel",
        resourceId: label.id,
        details: { name: label.name, boardId: label.boardId },
      });

      return label;
    } catch (error) {
      console.error("BoardLabelService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const label = await boardLabelRepo.findById(id);
      if (!label) {
        throw { message: "Label not found", status: 404 };
      }

      const board = await boardRepo.findById(label.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const updated = await boardLabelRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "board_label.updated",
        resource: "BoardLabel",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("BoardLabelService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const label = await boardLabelRepo.findById(id);
      if (!label) {
        throw { message: "Label not found", status: 404 };
      }

      const board = await boardRepo.findById(label.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await boardLabelRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "board_label.deleted",
        resource: "BoardLabel",
        resourceId: id,
        details: { name: label.name },
      });

      return { success: true };
    } catch (error) {
      console.error("BoardLabelService.delete error:", error);
      throw error;
    }
  }
}
