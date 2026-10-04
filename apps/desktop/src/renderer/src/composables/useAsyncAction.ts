import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { extractErrorMessage } from '@yunyan-live/utils';

export interface AsyncActionOptions {
  fallbackMessage?: string;
  onError?: (e: unknown) => void;
}

export function useAsyncAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  options?: AsyncActionOptions
) {
  const loading = ref(false);

  async function run(...args: A): Promise<R | undefined> {
    if (loading.value) return undefined;
    loading.value = true;
    try {
      return await action(...args);
    } catch (e) {
      if (options?.onError) {
        options.onError(e);
        return undefined;
      }
      if (options?.fallbackMessage) {
        ElMessage.error(extractErrorMessage(e, options.fallbackMessage));
        return undefined;
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return { loading, run };
}
