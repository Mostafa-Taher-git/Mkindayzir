"use client";

import { useCallback, useState } from "react";

type OptimisticMutationOptions<TVariables> = {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  onMutate?: (variables: TVariables) => unknown | Promise<unknown>;
  onError?: (error: Error, variables: TVariables, rollback: () => void) => void;
  onSettled?: () => void;
  realtimeEvent?: {
    event: string;
    entityType: string;
    entityId: string;
  };
};

type UseOptimisticMutationReturn<TVariables> = {
  mutate: (variables: TVariables) => void;
  isPending: boolean;
  error: Error | null;
};

export function useOptimisticMutation<TVariables>({
  mutationFn,
  onMutate,
  onError,
  onSettled,
  realtimeEvent,
}: OptimisticMutationOptions<TVariables>): UseOptimisticMutationReturn<TVariables> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (variables: TVariables) => {
      let rollback: (() => void) | undefined;

      try {
        setIsPending(true);
        setError(null);

        if (onMutate) {
          await onMutate(variables);
          rollback = () => {
            // Rollback handled by caller restoring previous state
          };
        }

        await mutationFn(variables);

        if (realtimeEvent) {
          const { broadcastAnyEvent } = await import("@/lib/realtime");
          broadcastAnyEvent(realtimeEvent.event, {
            entityType: realtimeEvent.entityType,
            entityId: realtimeEvent.entityId,
          });
        }
      } catch (err) {
        const actualError = err instanceof Error ? err : new Error("Unknown error");
        setError(actualError);
        if (onError) {
          onError(actualError, variables, rollback ?? (() => {}));
        }
      } finally {
        setIsPending(false);
        onSettled?.();
      }
    },
    [mutationFn, onMutate, onError, onSettled, realtimeEvent]
  );

  return { mutate, isPending, error };
}
