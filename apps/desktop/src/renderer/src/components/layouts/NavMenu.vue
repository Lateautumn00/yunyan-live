<template>
  <div class="v2-layout-sidemenu">
    <div class="logo-part">
      <img
        src="~@/assets/imgs/logo.png"
        alt=""
        class="logo"
        width="26"
        height="26"
        style="border-radius: 50%"
      >
      云砚直播
    </div>

    <el-menu
      :default-active="activeKey"
      @select="handleSelect"
    >
      <el-menu-item index="1">
        <el-icon :size="18">
          <Plus />
        </el-icon>
        <span>创建直播</span>
      </el-menu-item>
      <el-menu-item index="2">
        <el-icon :size="18">
          <VideoCameraFilled />
        </el-icon>
        <span>我的直播</span>
      </el-menu-item>
      <el-menu-item index="3">
        <el-icon :size="18">
          <VideoPlay />
        </el-icon>
        <span>回放管理</span>
      </el-menu-item>
      <el-menu-item index="4">
        <el-icon :size="18">
          <Switch />
        </el-icon>
        <span>转让管理</span>
      </el-menu-item>
    </el-menu>

    <img
      src="~@/assets/imgs/backstage/side-menu.png"
      alt="image"
    >
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

defineProps<{ activeKey?: string }>();

const router = useRouter();

const navTreeData = [
  {
    index: 1,
    label: '创建直播',
    link: '/teacher/createlive'
  },
  {
    index: 2,
    label: '我的直播',
    link: '/teacher/mylive'
  },
  {
    index: 3,
    label: '回放管理',
    link: '/teacher/playback'
  },
  {
    index: 4,
    label: '转让管理',
    link: '/teacher/transfer'
  }
];

function handleSelect(key: string) {
  console.log('[NavMenu] handleSelect called with key:', key);
  const target = navTreeData.find((item) => String(item.index) === key);
  console.log('[NavMenu] target:', target);
  if (target) {
    console.log('[NavMenu] pushing to:', target.link);
    void router.push(target.link).then((res) => {
      console.log('[NavMenu] navigation result:', res);
    }).catch((err) => {
      console.error('[NavMenu] navigation error:', err);
    });
  }
}
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.v2-layout-sidemenu {
  min-height: 960px;
  height: 100%;
  width: 145px;
  background: @color-FFF;
  box-shadow: 6px 0px 10px 0px #eeeff0;
  border-radius: 0px 10px 10px 0px;
  margin-top: -46px;

  .logo-part {
    display: flex;
    justify-content: center;
    align-items: center;
    padding-top: 27px;
    color: #000000;
    font-size: @fs14;

    img {
      margin-right: 10px;
    }
  }

  .el-menu {
    border-right: none;
    margin-top: 37px;
  }

  > img {
    position: absolute;
    bottom: 0;
  }
}
</style>

<style lang="less">
@import '~@/assets/styles/common/mixin.less';

.el-menu {
  .el-menu-item {
    height: 45px;
    line-height: 44px;
    span {
      color: @color-222222;
    }
  }
  .el-menu-item.is-active {
    background: @color-eff1fd;
    border-left: 4px solid @color-286bff;
    padding-left: 16px !important;
    span {
      color: @color-286bff;
    }
    .el-icon {
      color: @color-286bff;
    }
  }
}
</style>
