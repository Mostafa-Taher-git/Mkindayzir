import prisma from "@/lib/prisma";
import { BaseRepository } from "./base.repository";

export class CardMemberRepository extends BaseRepository<any> {
  constructor() {
    super(prisma.cardMember);
  }

  async findAll(cardId: string) {
    try {
      return await prisma.cardMember.findMany({
        where: { cardId },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find card members:", error);
      throw error;
    }
  }

  async findByIds(cardId: string, userId: string) {
    try {
      return await prisma.cardMember.findUnique({
        where: { cardId_userId: { cardId, userId } },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });
    } catch (error) {
      console.error("Failed to find card member:", error);
      throw error;
    }
  }
}
