<template>
  <div class="class-notification">
    <TransitionGroup name="notify">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="notify-item"
      >
        {{ item.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface NotificationItem {
  id: number;
  text: string;
}

const notifications = ref<NotificationItem[]>([]);
let nextId = 0;

function add(text: string, duration = 3000) {
  const id = nextId++;
  notifications.value.push({ id, text });
  setTimeout(() => {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }, duration);
}

defineExpose({ add });
</script>

<style lang="less" scoped>
.class-notification {
  position: fixed;
  top: 60px;
  right: 20px;
  z-index: 1000;
  pointer-events: none;
}
.notify-item {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 8px 16px;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 14px;
  white-space: nowrap;
}
.notify-enter-active {
  transition: all 0.5s ease;
}
.notify-leave-active {
  transition: all 0.5s ease;
}
.notify-enter-from {
  opacity: 0;
  transform: translateX(100px);
}
.notify-leave-to {
  opacity: 0;
  transform: translateX(100px);
}
</style>
