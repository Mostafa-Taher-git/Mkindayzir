export type OptimisticUpdate<T> = {
  previousState: T;
  optimisticState: T;
  serverState?: T;
};

export function applyOptimisticUpdate<T>(currentState: T, update: Partial<T>): T {
  return { ...currentState, ...update } as T;
}

export function revertOptimisticUpdate<T>(currentState: T, previousState: T): T {
  return { ...previousState };
}

export function isOptimisticState<T>(state: OptimisticUpdate<T>): boolean {
  return state.serverState === undefined;
}
