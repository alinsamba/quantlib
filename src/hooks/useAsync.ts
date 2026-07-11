import { useState, useCallback } from 'react';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

export function useAsync<T = any>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  const execute = useCallback(async (promiseFactory: () => Promise<T>, onSuccess?: (data: T) => void) => {
    setState({ data: null, isLoading: true, error: null });
    try {
      const data = await promiseFactory();
      setState({ data, isLoading: false, error: null });
      if (onSuccess) onSuccess(data);
      return data;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState({ data: null, isLoading: false, error: errorMsg });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}
