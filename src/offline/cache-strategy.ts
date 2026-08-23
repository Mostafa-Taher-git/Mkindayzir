import { db } from "./db";

export async function cacheEntity(
  entityType: string,
  entityId: string,
  data: unknown,
  ttlMs?: number
): Promise<void> {
  const now = Date.now();
  const expiresAt = ttlMs ? now + ttlMs : undefined;

  await db.cache.put({
    entityType,
    entityId,
    data,
    cachedAt: now,
    expiresAt,
  });
}

export async function getCachedEntity(
  entityType: string,
  entityId: string
): Promise<unknown | null> {
  const entity = await db.cache.where({ entityType, entityId }).first();

  if (!entity) {
    return null;
  }

  if (entity.expiresAt && Date.now() > entity.expiresAt) {
    await db.cache.delete(entity.id!);
    return null;
  }

  return entity.data;
}

export async function invalidateCache(
  entityType?: string,
  entityId?: string
): Promise<void> {
  if (entityType && entityId) {
    await db.cache.where({ entityType, entityId }).delete();
  } else if (entityType) {
    await db.cache.where("entityType").equals(entityType).delete();
  } else {
    await db.cache.clear();
  }
}

export async function warmCache(
  entityType: string,
  items: Array<{ entityId: string; data: unknown }>,
  ttlMs?: number
): Promise<void> {
  const now = Date.now();
  const expiresAt = ttlMs ? now + ttlMs : undefined;

  await db.cache.bulkPut(
    items.map((item) => ({
      entityType,
      entityId: item.entityId,
      data: item.data,
      cachedAt: now,
      expiresAt,
    }))
  );
}
