<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center statistics">
      <h3>直播概况</h3>
      <div class="grid-container">
        <div>总观看人数</div>
        <div>用户量</div>
        <div>总直播时长</div>
      </div>
      <h3>整体数据</h3>
      <div class="charts">
        <el-radio-group v-model="type">
          <el-radio-button value="分钟概括">
            分钟概括
          </el-radio-button>
          <el-radio-button value="人次概括">
            人次概括
          </el-radio-button>
          <el-date-picker
            v-model="timerange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
          />
        </el-radio-group>
      </div>
      <h3>地域分布</h3>
      <div class="area" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SidebarMenu from '@/layouts/sidebar.vue';

const activeKey = '5';
const type = ref('');
const timerange = ref('');
</script>

<style lang="less" scoped>
.statistics {
  background: #f8f8f8;
  box-shadow: none;
}
.grid-container {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr;
  gap: 20px 20px;
  grid-template-areas: '. . .';

  > div {
    min-width: 245px;
    height: 140px;
    background: #ffffff;
    box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.03);
    border-radius: 9px;
  }
}
.charts,
.area {
  min-width: 776px;
  min-height: 272px;
  background: #ffffff;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.03);
  border-radius: 8px;
}
</style>
