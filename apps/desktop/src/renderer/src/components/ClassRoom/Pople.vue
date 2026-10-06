<template>
  <div class="classroom-pople">
    <ul>
      <li v-for="(item, index) in userList" :key="index">
        <div class="name">
          {{ item.userName }}
        </div>
        <div v-if="item.isTeacher" class="span teacher">
          <el-icon><UserFilled /></el-icon> 主讲
        </div>
        <div v-if="item.opaqueId == liveUserId" class="span me">
          <el-icon><UserFilled /></el-icon> 我
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoomStore } from '@/store/room';

interface PopleUser {
  userName?: string;
  opaqueId?: string;
  isTeacher?: boolean;
}

defineProps<{ liveUserId?: string }>();

const userList = ref<PopleUser[]>([]);
const roomStore = useRoomStore();

function updatePopleList(poples: PopleUser[]) {
  userList.value = poples;
  // 单漏斗双写：局部渲染 ref + room store（@提及选项消费）
  roomStore.setMembers(poples);
}

defineExpose({ updatePopleList });
</script>

<style lang="less" scoped>
.classroom-pople {
  color: #323232;
  padding: 0px 6px;
  height: 100%;
  ul {
    overflow-y: scroll;
    overflow: auto;
    height: 100%;
    padding: 0px;
    padding-inline-start: 0px !important;
    margin-block-start: 0px !important;
    margin-block-end: 0px !important;
    li {
      list-style-type: none;
      min-height: 32px;
      margin-bottom: 8px;
      line-height: normal;
      font-size: 14px;
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 0 6px;
      &:first-child {
        margin-top: 0;
      }
      &:hover {
        background: #e2e2e7;
        border-radius: 3px;
      }
      .name {
        font-weight: 400;
        color: #323232;
      }
      .span {
        height: 16px;
        line-height: 16px;
        border-radius: 8px;
        padding-left: 10px;
        padding-right: 10px;
        font-weight: bold;
        display: flex;
        align-items: center;
        margin-left: 6px;
        img {
          width: 10px;
          height: 12px;
        }
        .el-icon {
          font-size: 10px;
          width: 10px;
          height: 12px;
          margin-right: 4px;
        }
      }
      .teacher {
        background: rgba(248, 130, 26, 0.2);
        color: #f8821a;
      }
      .me {
        background: rgba(97, 186, 71, 0.2);
        color: #61ba47;
      }
    }
  }
}
</style>
