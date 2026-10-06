<template>
  <el-dialog
    :model-value="modelValue"
    append-to-body
    title="课件上传"
    width="min(560px, 92vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="courseware-upload">
      <input
        ref="fileInputRef"
        type="file"
        accept=".ppt,.pptx"
        style="display: none"
        @change="takeFile"
      />
      <div class="upload-row">
        <el-button type="primary" :loading="uploading" @click="fileInputRef?.click()">
          选择 PPT 文件
        </el-button>
        <span class="tip">上传后进入直播间将自动导入白板</span>
      </div>

      <div v-loading="loadingList" class="courseware-list">
        <div v-if="items.length === 0 && !loadingList" class="empty">暂无课件</div>
        <div v-for="item in items" :key="item.id" class="courseware-item">
          <span class="name" :title="item.filename">{{ item.filename }}</span>
          <span class="size">{{ formatFileSize(item.filesize) }}</span>
          <el-button link type="danger" :loading="deletingId === item.id" @click="removeItem(item)">
            删除
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { formatFileSize } from '@yunyan-live/utils';
import Live from '@/api/backstage';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import { useAsyncAction } from '@/composables/useAsyncAction';
import { uploadPptFile, loadPptMeta } from '@/components/ClassRoom/whiteboard/pptImport';

interface CoursewareItem {
  id: string;
  filename: string;
  filext: string;
  filesize: number;
  fileUrl: string;
}

const props = defineProps<{
  modelValue: boolean;
  roomId: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const uploadPptApi = import.meta.env.VITE_UPLOAD_PPT_URL || '';
const fileInputRef = ref<HTMLInputElement>();
const deletingId = ref('');
const items = ref<CoursewareItem[]>([]);

const { loading: loadingList, run: runRefresh } = useAsyncAction(
  async () => {
    const res = await Live.courseware_list(props.roomId);
    items.value = res.data?.list ?? [];
  },
  {
    onError: e => {
      console.error('课件列表加载失败', e);
      ElMessage.error('课件列表加载失败');
    }
  }
);

// 打开弹窗时才拉取列表（挂载即拉会拖慢宿主页面，且列表可能还没进房就变化）
watch(
  () => props.modelValue,
  visible => {
    if (visible) void refresh();
  }
);

async function refresh() {
  if (!props.roomId) return;
  await runRefresh();
}

const { loading: uploading, run: runUpload } = useAsyncAction(
  async (file: File) => {
    const fileUrl = await uploadPptFile(uploadPptApi, file);
    // 提前校验 PDF 可读性：坏文件不入表（服务端 LibreOffice 转换最长约 2 分钟）
    await loadPptMeta(fileUrl);
    const filename = file.name.replace(/\.[^.]+$/, '');
    const filext = file.name.split('.').pop() || 'ppt';
    await Live.save_courseware({
      roomId: props.roomId,
      filename,
      filext,
      filesize: file.size,
      fileUrl
    });
    ElMessage.success('课件已上传，进入直播间后自动导入');
    await refresh();
  },
  { onError: err => ElMessage.error((err as Error).message || '课件上传失败') }
);

async function takeFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  if (!/\.pptx?$/i.test(file.name)) {
    ElMessage.warning('仅支持 .ppt / .pptx 文件');
    return;
  }

  await runUpload(file);
}

const { ask, perform } = useConfirmDelete<CoursewareItem>({
  message: item => `确定删除课件「${item.filename}」？删除后直播间将不再自动导入它。`,
  boxTitle: '删除课件',
  action: item => Live.delete_courseware(item.id),
  successMessage: () => '已删除',
  refresh: () => refresh(),
  onError: e => {
    console.error('课件删除失败', e);
    ElMessage.error('删除失败');
  }
});

async function removeItem(item: CoursewareItem) {
  // 空 id 会让服务端静默返回成功但一条没删，直接拦截并提示
  if (!item.id) {
    ElMessage.error('课件数据异常（缺少ID），请刷新后重试');
    return;
  }
  if (!(await ask(item))) return;
  deletingId.value = item.id;
  try {
    await perform(item);
  } finally {
    deletingId.value = '';
  }
}
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.courseware-upload {
  .upload-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    .tip {
      color: @color-666666;
      font-size: @fs14;
    }
  }

  .courseware-list {
    min-height: 80px;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid #ebeef5;
    border-radius: 6px;

    .empty {
      padding: 24px 0;
      text-align: center;
      color: @color-666666;
      font-size: @fs14;
    }

    .courseware-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid #f2f2f2;

      &:last-child {
        border-bottom: none;
      }

      .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: @color-2c2c34;
        font-size: @fs14;
      }

      .size {
        color: @color-666666;
        font-size: 12px;
      }
    }
  }
}
</style>
