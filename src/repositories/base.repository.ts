import prisma from "@/lib/prisma";

export type PaginationOptions = {
  page?: number;
  perPage?: number;
};

export class BaseRepository<T> {
  constructor(private modelDelegate: unknown) {}

  async findById(id: string) {
    try {
      return await (this.modelDelegate as { findUnique: (args: unknown) => Promise<T | null> }).findUnique({
        where: { id },
      });
    } catch (error) {
      console.error(`Failed to find by id:`, error);
      throw error;
    }
  }

  async findMany(options?: { where?: Record<string, unknown> } & PaginationOptions) {
    try {
      const { where, page = 1, perPage = 20, ...rest } = options || {};
      const args: Record<string, unknown> = {
        where,
        ...rest,
      };

      if (page && perPage) {
        args.skip = (page - 1) * perPage;
        args.take = perPage;
      }

      return await (this.modelDelegate as { findMany: (args: unknown) => Promise<T[]> }).findMany(args);
    } catch (error) {
      console.error(`Failed to find many:`, error);
      throw error;
    }
  }

  async count(where?: Record<string, unknown>) {
    try {
      return await (this.modelDelegate as { count: (args: unknown) => Promise<number> }).count({ where });
    } catch (error) {
      console.error(`Failed to count:`, error);
      throw error;
    }
  }
}
