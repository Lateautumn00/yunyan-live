<script setup lang="ts">
defineOptions({ name: 'NotFound' });
</script>

<template>
  <div class="error-page">
    <h1>404</h1>
    <p>页面不存在</p>
    <router-link to="/login"> 返回首页 </router-link>
  </div>
</template>

<style scoped>
.error-page {
  text-align: center;
  padding: 60px;
}
</style>
