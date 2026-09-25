<template>
  <el-dialog
    :model-value="visible"
    :title="playTitle"
    width="60%"
    center
    top="0vh"
    class="history-dig"
    @close="$emit('close')"
  >
    <HistoryVideo
      :id="playId"
      ref="historyvideoRef"
      :opaque-id="opaqueId"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import HistoryVideo from './HistoryVideo.vue';

defineProps<{
  visible: boolean;
  playId?: string;
  playTitle: string;
  opaqueId: string;
}>();

defineEmits<{
  close: [];
}>();

const historyvideoRef = ref<InstanceType<typeof HistoryVideo> | null>(null);

function playStop() {
  historyvideoRef.value?.playStop();
}

defineExpose({ playStop });
</script>
