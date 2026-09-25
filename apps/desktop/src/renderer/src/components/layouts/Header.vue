<template>
  <div class="header">
    <ul>
      <li class="login-name">
        {{ userStore.userInfo.userName }}
      </li>
      <li>欢迎您</li>
      <li>
        <el-button
          text
          @click="settingsVisible = true"
        >
          设置
        </el-button>
        <SettingsDialog v-model="settingsVisible" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useUserStore } from '@/store/user';
import SettingsDialog from '@/components/SettingsDialog.vue';

const userStore = useUserStore();
const settingsVisible = ref(false);
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.header {
  width: 100%;
  height: 46px;
  background: @color-FFF;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.06);
  justify-content: flex-end;
  align-items: center;
  display: flex;

  ul {
    display: flex;
    list-style: none;
    align-items: center;
    margin-right: 20px;
    font-size: @fs12;
    color: @color-333333;

    .login-name {
      margin-right: 10px;
      font-weight: bold;
    }
    li:nth-child(2) {
      margin-right: 20px;
    }
  }
}
</style>
