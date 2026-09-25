<template>
  <div
    class="classroom-apply"
    :class="isTeacher ? 'set-height' : ''"
  >
    <ul v-if="isTeacher && isInteraction == 0">
      <li
        v-for="(item, index) in userList"
        :key="index"
      >
        <div class="name">
          {{ item.userName }}
        </div>
        <div class="span">
          <span
            class="no"
            @click="agree(false, item.display, index, 5)"
          >拒绝</span><span
            class="ok"
            @click="agree(true, item.display, index, 4)"
          >同意</span>
        </div>
      </li>
    </ul>
    <ul v-if="!isSmall && (isInteraction == 2 || isInteraction == 3)">
      <li class="hands-up">
        <div class="name">
          {{ audioUserName }}<span
            v-if="isSpeak"
            class="open"
          >发言中...</span><span
            v-else
            class="stop"
          >已禁麦</span>
        </div>
        <div
          v-if="isTeacher || isInteraction == 2"
          class="span"
        >
          <span
            v-if="isSpeak"
            class="ismuted"
            @click="isTalking('off')"
          >禁麦</span><span
            v-else
            class="ismuted"
            @click="isTalking('on')"
          >开麦</span><span
            class="canel"
            @click="stopApplication"
          >退出</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface ApplyUser {
  userName?: string;
  opaqueId?: string;
  display?: string;
}

withDefaults(defineProps<{
  isInteraction?: number;
  isTeacher?: boolean;
  isSmall?: boolean;
}>(), {
  isInteraction: 0,
  isTeacher: false,
  isSmall: false,
});

const emit = defineEmits<{
  (e: 'isTalking', type: string): void;
  (e: 'stopApplication'): void;
  (e: 'agree', status: boolean, item: string | undefined, index: number, num: number): void;
}>();

const userList = ref<ApplyUser[]>([]);
const isSpeak = ref(false);
const audioUserName = ref('');

function isTalking(type: string) {
  emit('isTalking', type);
}

function stopApplication() {
  emit('stopApplication');
}

function applyList(status: boolean, data: ApplyUser) {
  if (status) {
    userList.value.unshift(data);
  } else {
    const index = userList.value.findIndex((item) => item.opaqueId === data.opaqueId);
    if (index >= 0) userList.value.splice(index, 1);
  }
}

function agree(status: boolean, item: string | undefined, index: number, num: number) {
  if (status) {
    userList.value = [];
  } else {
    userList.value.splice(index, 1);
  }
  emit('agree', status, item, index, num);
}

function setAudioAll(user: string[]) {
  audioUserName.value = user[2] ?? '';
  isSpeak.value = user[3] === 'off' ? false : true;
}

defineExpose({ applyList, agree, setAudioAll, isTalking, stopApplication });
</script>

<style lang="less" scoped>
.set-height {
  height: 100%;
}
.classroom-apply {
  color: #323232;
  padding: 0px;

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
      line-height: 32px;
      height: 32px;
      font-size: 14px;
      display: flex;
      align-items: center;
      padding: 0 6px;
      justify-content: space-between;
      &:hover {
        background: #e2e2e7;
        border-radius: 3px;
      }
      .name {
        font-weight: 400;
        color: #323232;
        .stop {
          color: #e0383e;
        }

        .open {
          color: #61ba47;
        }
      }
      .span {
        height: 20px;
        line-height: 20px;
        border-radius: 8px;
        padding-left: 10px;
        padding-right: 10px;
        font-weight: 500;
        display: flex;
        align-items: center;
        margin-left: 6px;

        .ok {
          color: #61ba47;
          margin-left: 13px;
          cursor: pointer;
        }
        .no {
          color: #e0383e;
          cursor: pointer;
        }
        .ismuted {
          color: #f8821a;
          cursor: pointer;
        }
        .canel {
          color: #e0383e;
          margin-left: 13px;
          cursor: pointer;
        }
      }
    }
    .hands-up {
      background: #e2e2e7;
      border-radius: 3px;
    }
  }
}
</style>