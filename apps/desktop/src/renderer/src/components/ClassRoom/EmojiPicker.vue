<template>
  <div v-click-outside="close" class="emoji">
    <span class="emoji-btn" aria-label="表情" @click="open = !open">😀</span>
    <div v-if="open" class="emoji-panel">
      <span v-for="e in EMOJI_LIST" :key="e" class="emoji-item" @click="emit('select', e)">{{
        e
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ClickOutside as vClickOutside } from 'element-plus';
import { EMOJI_LIST } from '@/utils/chatFormat';

const emit = defineEmits<{ (e: 'select', emoji: string): void }>();
const open = ref(false);

function close() {
  open.value = false;
}
</script>

<style scoped lang="less">
.emoji {
  position: relative;
  .emoji-btn {
    cursor: pointer;
    font-size: 18px;
    margin: 0 6px;
    width: 32px;
    height: 32px;
    line-height: 32px;
    text-align: center;
    display: inline-block;
    &:hover {
      background: #e2e2e7;
      border-radius: 6px;
    }
  }
  .emoji-panel {
    position: absolute;
    bottom: 40px;
    left: 0;
    z-index: 10;
    width: 252px;
    padding: 8px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    .emoji-item {
      font-size: 18px;
      text-align: center;
      cursor: pointer;
      padding: 2px 0;
      &:hover {
        background: #e2e2e7;
        border-radius: 4px;
      }
    }
  }
}
</style>
