<script setup lang="ts">
import type { ToolbarIcon } from './whiteboard/toolbarGroups';

defineProps<{ icon: ToolbarIcon }>();
</script>

<template>
  <el-icon v-if="icon.kind === 'el'"><component :is="icon.name" /></el-icon>
  <span
    v-else-if="icon.kind === 'glyph'"
    class="tg-glyph"
    :class="{ 'tg-glyph-wide': icon.char.length > 2, 'tg-glyph-f': icon.char === 'F' }"
  >
    {{ icon.char }}
  </span>
  <span v-else class="tg-sprite" :class="icon.cls" />
</template>
