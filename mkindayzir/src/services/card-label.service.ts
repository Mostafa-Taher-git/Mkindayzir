import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/helpers";
import { CardLabelRepository } from "@/repositories/card-label.repository";
import { CardRepository } from "@/repositories/card.repository";
import { BoardRepository } from "@/repositories/board.repository";
import { SpaceRepository } from "@/repositories/space.repository";

const cardLabelRepo = new CardLabelRepository();
const cardRepo = new CardRepository();
const boardRepo = new BoardRepository();
const spaceRepo = new SpaceRepository();

export class CardLabelService {
  async list(cardId: string, user: { id: string; role: string }) {
    const auth = await requirePermission("view:boards");
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

      return await cardLabelRepo.findAll(cardId);
    } catch (error) {
      console.error("CardLabelService.list error:", error);
      throw error;
    }
  }

  async add(cardId: string, labelId: string, user: { id: string; role: string }) {
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
        action: "card_label.added",
        resource: "CardLabel",
        resourceId: cardId,
        details: { labelId },
      });

      return label;
    } catch (error) {
      console.error("CardLabelService.add error:", error);
      throw error;
    }
  }

  async remove(cardId: string, labelId: string, user: { id: string; role: string }) {
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
        action: "card_label.removed",
        resource: "CardLabel",
        resourceId: cardId,
        details: { labelId },
      });

      return result;
    } catch (error) {
      console.error("CardLabelService.remove error:", error);
      throw error;
    }
  }
}
