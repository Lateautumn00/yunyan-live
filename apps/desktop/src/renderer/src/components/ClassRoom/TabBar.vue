<template>
  <div class="center">
    <div class="card">
      <el-button
        v-for="tab in tabs"
        :key="tab.key"
        class="but"
        :class="activeName === tab.key ? 'whitebg' : ''"
        @click="$emit('click', tab.key)"
      >
        <el-badge
          v-if="tab.badge !== undefined"
          :value="tab.badge"
          :max="max"
          :hidden="!tab.badge"
          class="item"
        >
          {{ tab.label }}
        </el-badge>
        <template v-else>
          {{ tab.label }}
        </template>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface TabItem {
  key: string;
  label: string;
  badge?: number;
}

defineProps<{
  tabs: TabItem[];
  activeName: string;
  max: number;
}>();

defineEmits<{
  click: [key: string];
}>();
</script>

<style lang="less" scoped>
.center {
  display: flex;
  align-items: center;
  height: 38px;
  border-bottom: 1px solid #eee;
}
.card {
  display: flex;
  width: 100%;
}
.but {
  border: none;
  background: none;
  font-size: 12px;
}
.whitebg {
  background: #fff;
  border-bottom: 2px solid #1989fa;
  border-radius: 0;
  color: #1989fa;
}
</style>
