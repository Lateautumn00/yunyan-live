import { ElMessage } from 'element-plus';
import { copyText } from '@/utils/webBridge';

export function useCopy(options?: { successMessage?: string; errorMessage?: string }) {
  const successMessage = options?.successMessage ?? '复制成功';
  const errorMessage = options?.errorMessage ?? '复制失败';

  async function copy(text: string): Promise<boolean> {
    const ok = await copyText(text);
    if (ok) {
      ElMessage.success(successMessage);
    } else {
      ElMessage.error(errorMessage);
    }
    return ok;
  }

  return { copy };
}
