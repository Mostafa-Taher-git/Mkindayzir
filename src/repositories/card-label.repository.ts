import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class CardLabelRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.cardLabel);
  }

  async findAll(cardId: string) {
    try {
      return await prisma.cardLabel.findMany({
        where: { cardId },
        include: { label: true },
      });
    } catch (error) {
      console.error("Failed to find card labels:", error);
      throw error;
    }
  }

  async findByIds(cardId: string, labelId: string) {
    try {
      return await prisma.cardLabel.findUnique({
        where: { cardId_labelId: { cardId, labelId } },
        include: { label: true },
      });
    } catch (error) {
      console.error("Failed to find card label:", error);
      throw error;
    }
  }
}
