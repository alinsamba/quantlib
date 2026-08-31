import { useState, useCallback, useRef } from 'react';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for managing asynchronous operations with race condition protection.
 * Uses active request sequence IDs to ignore stale out-of-order promise resolutions.
 */
export function useAsync<T = unknown>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });
  const activeRequestId = useRef(0);

  const execute = useCallback(
    async (
      promiseFactory: () => Promise<T>,
      onSuccess?: (data: T) => void,
      options?: { rethrow?: boolean }
    ) => {
      const currentId = ++activeRequestId.current;
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const data = await promiseFactory();
        if (currentId === activeRequestId.current) {
          setState({ data, isLoading: false, error: null });
          if (onSuccess) onSuccess(data);
        }
        return data;
      } catch (err: unknown) {
        if (currentId === activeRequestId.current) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          setState((prev) => ({ ...prev, isLoading: false, error: errorMsg }));
        }
        if (options?.rethrow) {
          throw err;
        }
        return undefined;
      }
    },
    []
  );

  const reset = useCallback(() => {
    activeRequestId.current++;
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}
