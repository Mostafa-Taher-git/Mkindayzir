export interface ConflictContext {
  localData: unknown;
  remoteData: unknown;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
}

export interface ConflictResult {
  resolved: boolean;
  strategy: "local" | "remote";
  data: unknown;
}

export function resolveConflict(context: ConflictContext): ConflictResult {
  const { localData, remoteData, localUpdatedAt, remoteUpdatedAt } = context;

  if (localUpdatedAt >= remoteUpdatedAt) {
    return {
      resolved: true,
      strategy: "local",
      data: localData,
    };
  }

  return {
    resolved: true,
    strategy: "remote",
    data: remoteData,
  };
}
