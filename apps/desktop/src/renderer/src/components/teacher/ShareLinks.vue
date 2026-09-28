<template>
  <div class="share-links">
    <div class="share-row">
      <div class="code">
        <span>直播码</span>
        <span>{{ localCode }}</span>
        <el-icon
          class="copy"
          aria-label="复制"
          @click="copyLink(localCode)"
        >
          <CopyDocument />
        </el-icon>
      </div>
      <el-button @click="updateCode">
        更新参加码
      </el-button>
    </div>
    <div class="share-row">
      <div class="copy-line">
        <label for="">客户端进入</label>
        <el-input
          :model-value="entryLink"
          readonly
        />
      </div>
      <span
        class="copy"
        @click="copyLink(entryLink)"
      >复制</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import Live from '@/api/backstage';
import { copyText } from '@/utils/webBridge';

const props = withDefaults(
  defineProps<{
    roomId: string;
    joinCode?: string;
    clientLink?: string;
  }>(),
  { joinCode: '', clientLink: 'https://500px.com' }
);

const emit = defineEmits<{ updated: [code: string] }>();

const localCode = ref(props.joinCode);
const entryLink = props.clientLink;

watch(
  () => props.joinCode,
  value => {
    localCode.value = value;
  }
);

async function updateCode() {
  try {
    const res = await Live.update_code({ roomId: props.roomId });
    const data = res.data.data as string;
    localCode.value = data;
    emit('updated', data);
    ElMessage.success(res.data.msg ?? '更新成功');
  } catch (e) {
    console.error(e);
  }
}

function copyLink(content: string | undefined) {
  if (content) void copyText(content);
  ElMessage.success('复制成功');
}
</script>

<style lang="less" scoped>
.share-links {
  width: 100%;

  .share-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    & + .share-row {
      margin-top: 16px;
    }
  }

  .code {
    display: flex;
    align-items: center;
    gap: 8px;

    > span:last-of-type {
      color: #286bff;
    }

    .copy {
      font-size: 14px;
      cursor: pointer;
    }
  }

  .copy-line {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;

    label {
      width: 93px;
      flex-shrink: 0;
    }

    .el-input {
      flex: 1;
      min-width: 0;
    }
  }

  .copy {
    cursor: pointer;
    color: #286bff;
    margin-left: 12px;
    flex-shrink: 0;
  }
}
</style>
