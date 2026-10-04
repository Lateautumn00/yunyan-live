import { ref } from 'vue';

export interface PageQuery {
  pageNum: number;
  pageSize: number;
}

export interface PagedResult<T> {
  list: T[];
  total: number;
}

export function usePagedList<T>(options: {
  fetchPage: (query: PageQuery) => Promise<PagedResult<T>>;
  pageSize?: number;
  initialLoading?: boolean;
  onError?: (e: unknown) => void;
}) {
  const params = ref<PageQuery>({ pageNum: 1, pageSize: options.pageSize ?? 6 });
  const list = ref<T[]>([]);
  const total = ref(0);
  const loading = ref(options.initialLoading ?? false);

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const result = await options.fetchPage({
        pageNum: params.value.pageNum,
        pageSize: params.value.pageSize
      });
      list.value = result.list;
      total.value = result.total;
    } catch (e) {
      if (options.onError) options.onError(e);
      else console.error(e);
    } finally {
      loading.value = false;
    }
  }

  function handleSizeChange(size: number) {
    params.value.pageSize = size;
    params.value.pageNum = 1;
    void load();
  }

  function handleCurrentChange(current: number) {
    params.value.pageNum = current;
    void load();
  }

  return { params, list, total, loading, load, handleSizeChange, handleCurrentChange };
}
