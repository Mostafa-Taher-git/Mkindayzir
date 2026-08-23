import { requirePermission } from "@/lib/rbac.server";
import { audit } from "@/lib/helpers";
import { CardRepository } from "@/repositories/card.repository";
import { ColumnRepository } from "@/repositories/column.repository";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const cardRepo = new CardRepository();
const columnRepo = new ColumnRepository();
const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class CardService {
  async list(columnId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const column = await columnRepo.findById(columnId);
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

      return await cardRepo.findAll(columnId);
    } catch (error) {
      console.error("CardService.list error:", error);
      throw error;
    }
  }

  async listByBoard(boardId: string) {
    try {
      return await cardRepo.findByBoard(boardId);
    } catch (error) {
      console.error("CardService.listByBoard error:", error);
      throw error;
    }
  }

  async get(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(id);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      return card;
    } catch (error) {
      console.error("CardService.get error:", error);
      throw error;
    }
  }

  async create(data: { columnId: string; title: string; description?: string; dueDate?: Date; coverImage?: string; metadata?: Record<string, unknown> }, user: { id: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const column = await columnRepo.findById(data.columnId);
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

      const card = await cardRepo.create(data, user.id);

      await audit({
        userId: user.id,
        action: "card.created",
        resource: "Card",
        resourceId: card.id,
        details: { title: card.title, columnId: card.columnId },
      });

      return card;
    } catch (error) {
      console.error("CardService.create error:", error);
      throw error;
    }
  }

  async update(id: string, data: Record<string, unknown>, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(id);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const updated = await cardRepo.update(id, data, user.id);

      await audit({
        userId: user.id,
        action: "card.updated",
        resource: "Card",
        resourceId: id,
        details: data,
      });

      return updated;
    } catch (error) {
      console.error("CardService.update error:", error);
      throw error;
    }
  }

  async delete(id: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(id);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      await cardRepo.delete(id, user.id);

      await audit({
        userId: user.id,
        action: "card.deleted",
        resource: "Card",
        resourceId: id,
        details: { title: card.title },
      });

      return { success: true };
    } catch (error) {
      console.error("CardService.delete error:", error);
      throw error;
    }
  }

  async move(cardId: string, targetColumnId: string, position: number, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const targetColumn = await columnRepo.findById(targetColumnId);
      if (!targetColumn) {
        throw { message: "Target column not found", status: 404 };
      }

      const targetBoard = await boardRepo.findById(targetColumn.boardId);
      if (!targetBoard) {
        throw { message: "Target board not found", status: 404 };
      }

      if (board.id !== targetBoard.id) {
        throw { message: "Cannot move card to different board", status: 400 };
      }

      const moved = await cardRepo.move(cardId, targetColumnId, position);

      await audit({
        userId: user.id,
        action: "card.moved",
        resource: "Card",
        resourceId: cardId,
        details: { targetColumnId, position },
      });

      return moved;
    } catch (error) {
      console.error("CardService.move error:", error);
      throw error;
    }
  }

  async addMember(cardId: string, userId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const member = await cardRepo.addMember(cardId, userId);

      await audit({
        userId: user.id,
        action: "card.member_added",
        resource: "Card",
        resourceId: cardId,
        details: { userId },
      });

      return member;
    } catch (error) {
      console.error("CardService.addMember error:", error);
      throw error;
    }
  }

  async removeMember(cardId: string, userId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const result = await cardRepo.removeMember(cardId, userId);

      await audit({
        userId: user.id,
        action: "card.member_removed",
        resource: "Card",
        resourceId: cardId,
        details: { userId },
      });

      return result;
    } catch (error) {
      console.error("CardService.removeMember error:", error);
      throw error;
    }
  }

  async addLabel(cardId: string, labelId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const label = await cardRepo.addLabel(cardId, labelId);

      await audit({
        userId: user.id,
        action: "card.label_added",
        resource: "Card",
        resourceId: cardId,
        details: { labelId },
      });

      return label;
    } catch (error) {
      console.error("CardService.addLabel error:", error);
      throw error;
    }
  }

  async removeLabel(cardId: string, labelId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("manage:boards");
    if (!auth.authorized || !auth.session) return auth.error! as any;

    try {
      const card = await cardRepo.findById(cardId);
      if (!card) {
        throw { message: "Card not found", status: 404 };
      }

      const board = await boardRepo.findById(card.column.boardId);
      if (!board) {
        throw { message: "Board not found", status: 404 };
      }

      const isMember = await spaceRepo.isMember(board.spaceId, user.id);
      if (!isMember) {
        throw { message: "Forbidden", status: 403 };
      }

      const result = await cardRepo.removeLabel(cardId, labelId);

      await audit({
        userId: user.id,
        action: "card.label_removed",
        resource: "Card",
        resourceId: cardId,
        details: { labelId },
      });

      return result;
    } catch (error) {
      console.error("CardService.removeLabel error:", error);
      throw error;
    }
  }
}
