<script setup lang="ts">
import { emitter } from '@/utils/mitt';
import { useNav } from '@/layout/hooks/useNav';
import LayNotice from '../lay-notice/index.vue';
import { responsiveStorageNameSpace } from '@/config';
import { ref, nextTick, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { storageLocal, isAllEmpty } from '@pureadmin/utils';
import { usePermissionStoreHook } from '@/store/modules/permission';
import LaySidebarItem from '../lay-sidebar/components/SidebarItem.vue';
import LaySidebarFullScreen from '../lay-sidebar/components/SidebarFullScreen.vue';

const route = useRoute();
const menuRef = ref();
const showLogo = ref(
  storageLocal().getItem<StorageConfigs>(`${responsiveStorageNameSpace()}configure`)?.showLogo ??
    true
);

const {
  title,
  logout,
  getLogo,
  username,
  userAvatar,
  avatarsStyle,
  backTopMenu,
  toAccountSettings
} = useNav();

const defaultActive = computed(() =>
  !isAllEmpty(route.meta?.activePath) ? route.meta.activePath : route.path
);

nextTick(() => {
  menuRef.value?.handleResize();
});

onMounted(() => {
  emitter.on('logoChange', key => {
    showLogo.value = key;
  });
});
</script>

<template>
  <div v-loading="usePermissionStoreHook().wholeMenus.length === 0" class="horizontal-header">
    <div v-if="showLogo" class="horizontal-header-left" @click="backTopMenu">
      <img :src="getLogo()" alt="logo" />
      <span>{{ title }}</span>
    </div>
    <el-menu
      ref="menuRef"
      mode="horizontal"
      popper-class="pure-scrollbar"
      class="horizontal-header-menu"
      :default-active="defaultActive"
    >
      <LaySidebarItem
        v-for="route in usePermissionStoreHook().wholeMenus"
        :key="route.path"
        :item="route"
        :base-path="route.path"
      />
    </el-menu>
    <div class="horizontal-header-right">
      <!-- 全屏 -->
      <LaySidebarFullScreen id="full-screen" />
      <!-- 消息通知 -->
      <LayNotice id="header-notice" />
      <!-- 账户 -->
      <el-dropdown trigger="click">
        <span class="el-dropdown-link navbar-bg-hover">
          <img :src="userAvatar" :style="avatarsStyle" />
          <p v-if="username" class="dark:text-white">{{ username }}</p>
        </span>
        <template #dropdown>
          <el-dropdown-menu class="logout">
            <el-dropdown-item @click="toAccountSettings"> 账户设置 </el-dropdown-item>
            <el-dropdown-item @click="logout"> 退出登录 </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-loading-mask) {
  opacity: 0.45;
}

.logout {
  width: 120px;

  :deep(.el-dropdown-menu__item) {
    display: inline-flex;
    flex-wrap: wrap;
    min-width: 100%;
  }
}
</style>
