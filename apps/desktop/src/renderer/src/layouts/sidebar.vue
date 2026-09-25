<template>
  <div class="sidebar">
    <Header />
    <NavMenu :active-key="activeKey" />
  </div>
</template>

<script setup lang="ts">
import Header from '@/components/layouts/Header.vue';
import NavMenu from '@/components/layouts/NavMenu.vue';

defineProps<{ activeKey?: string }>();
</script>

<style lang="less" scoped>
.sidebar {
  min-height: 960px;
  height: 100%;
}
</style>

<style lang="less">
html,
body {
  height: 100%;
}
</style>
