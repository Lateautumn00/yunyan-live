import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

export interface ConfirmDeleteOptions<T> {
  message: (payload: T) => string;
  action: (payload: T) => Promise<unknown>;
  boxTitle?: string;
  confirmText?: string;
  cancelText?: string;
  successMessage?: (result: unknown) => string;
  refresh?: (payload: T) => void | Promise<void>;
  onError?: (e: unknown) => void;
}

export function useConfirmDelete<T>(options: ConfirmDeleteOptions<T>) {
  const deleting = ref(false);

  async function ask(payload: T): Promise<boolean> {
    try {
      await ElMessageBox.confirm(options.message(payload), options.boxTitle ?? '提示', {
        confirmButtonText: options.confirmText ?? '确定',
        cancelButtonText: options.cancelText ?? '取消',
        type: 'warning'
      });
      return true;
    } catch {
      return false;
    }
  }

  async function perform(payload: T): Promise<boolean> {
    try {
      const result = await options.action(payload);
      if (options.successMessage) {
        ElMessage.success(options.successMessage(result));
      }
      await options.refresh?.(payload);
      return true;
    } catch (e) {
      options.onError?.(e);
      return false;
    }
  }

  async function confirmAndDelete(payload: T): Promise<boolean> {
    if (deleting.value) return false;
    deleting.value = true;
    try {
      if (!(await ask(payload))) return false;
      return await perform(payload);
    } finally {
      deleting.value = false;
    }
  }

  return { deleting, ask, perform, confirmAndDelete };
}
