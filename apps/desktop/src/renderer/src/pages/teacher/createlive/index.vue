<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center create-live">
      <div class="create-form">
        <div>
          <h3>基本信息</h3>

          <el-form ref="liveFormRef" :model="liveForm" :rules="rules" label-width="110px">
            <el-form-item label="直播名称" prop="title">
              <el-input v-model="liveForm.title" />
            </el-form-item>

            <el-form-item label="直播类型" prop="type">
              <div class="live-type">
                <div
                  class="class-type small"
                  :class="liveForm.type === 0 ? 'checked' : ''"
                  @click="setClassType(0)"
                >
                  <div>
                    <h4>小班教学</h4>
                    <p>适用于1-10人小班面对面教学场景，学生听课更流畅，免费。</p>
                  </div>
                </div>
                <div
                  class="class-type big"
                  :class="liveForm.type === 1 ? 'checked' : ''"
                  @click="setClassType(1)"
                >
                  <div>
                    <h4>大班教学</h4>
                    <p>适用教育机构开展招生引流课程，支持百人同时在线，稳定流畅，高清画质。</p>
                  </div>
                </div>
              </div>
            </el-form-item>
            <el-form-item label="开始时间" prop="startTime" required>
              <el-date-picker
                v-model="liveForm.startTime"
                type="datetime"
                format="YYYY-MM-DD HH:mm"
                placeholder="选择日期时间"
                :disabled-date="disabledDate"
                :disabled-hours="disabledHours"
                :disabled-minutes="disabledMinutes"
              />
            </el-form-item>
            <el-form-item label="直播时长" prop="duration">
              <el-input-number
                v-model="liveForm.duration"
                :min="10"
                :max="1000"
                placeholder="请输入分钟"
              />
            </el-form-item>
          </el-form>
        </div>
      </div>
      <el-button type="primary" :loading="creating" @click="submitForm"> 创建 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import dayjs from 'dayjs';
import { randomString } from '@yunyan-live/utils';
import { isVoid, isCheckedAllRules } from '@yunyan-live/validation';
import SidebarMenu from '@/layouts/sidebar.vue';
import type { JanusHandle, JanusSession } from '@/vendor/live/live';
import { config } from '@/api';
import { useServerTime } from '@/composables/useServerTime';
import Live from '@/api/backstage';
import { useUserStore } from '@/store/user';

interface CreateForm {
  title: string;
  startTime: string | Date | null;
  type: number;
  roomId: string;
  duration: number | null;
}

const router = useRouter();
const userStore = useUserStore();

const activeKey = '1';
const opaqueId = ref(userStore.guid);
const room = ref<JanusSession | null>(null);
const plugin = ref<JanusHandle | null>(null);
const boardPlugin = ref<JanusHandle | null>(null);
const janusLib = ref<(typeof import('@/vendor/live/live'))['default'] | null>(null);
const liveFormRef = ref<FormInstance>();
const creating = ref(false);
const liveForm = ref<CreateForm>({
  title: '',
  startTime: null,
  type: 0,
  roomId: '',
  duration: null
});

const rules = ref<FormRules>({
  title: [{ required: true, validator: validateTitle, trigger: 'blur' }],
  type: [{ required: true, message: '请选择直播类型', trigger: 'blur' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'blur' }],
  duration: [{ required: true, validator: validateDuration, trigger: 'blur' }]
});

function validateTitle(_rule: unknown, value: string, callback: (error?: Error) => void) {
  if (isVoid(value)) {
    callback(new Error('请输入直播名称'));
  } else if (!isCheckedAllRules(value, 'liveName')) {
    callback(new Error('限制1～50位'));
  } else {
    callback();
  }
}

function validateDuration(_rule: unknown, value: number, callback: (error?: Error) => void) {
  if (!value) {
    callback(new Error('请输入直播时长'));
  } else if (value == 0) {
    callback(new Error('直播时长不能为0'));
  } else if (value < 0) {
    callback(new Error('直播时长不能是负数'));
  } else {
    callback();
  }
}

function setClassType(type: number) {
  liveForm.value.type = type;
}

function disabledDate(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function disabledHours() {
  const now = new Date();
  const selected = liveForm.value.startTime ? new Date(liveForm.value.startTime) : null;
  if (!selected || selected.toDateString() !== now.toDateString()) return [];
  const hours: number[] = [];
  for (let i = 0; i < now.getHours(); i++) hours.push(i);
  return hours;
}

function disabledMinutes(hour: number) {
  const now = new Date();
  const selected = liveForm.value.startTime ? new Date(liveForm.value.startTime) : null;
  if (!selected || selected.toDateString() !== now.toDateString() || hour !== now.getHours())
    return [];
  const minutes: number[] = [];
  for (let i = 0; i < now.getMinutes(); i++) minutes.push(i);
  return minutes;
}

function submitForm(): void {
  if (creating.value) return;
  liveFormRef.value?.validate((valid: boolean) => {
    if (valid) {
      creating.value = true;
      void createLive();
    }
  });
}

async function LiveCreate() {
  try {
    const res = await Live.create_live({
      title: liveForm.value.title,
      startTime: dayjs(liveForm.value.startTime).valueOf().toString(),
      type: liveForm.value.type,
      roomId: liveForm.value.roomId,
      duration: liveForm.value.duration ? Number(liveForm.value.duration) : undefined
    });
    ElMessage.success(res.msg ?? '创建成功');
    void router.push({
      path: '/teacher/createlive/detail',
      query: {
        roomId: liveForm.value.roomId
      }
    });
  } catch (e) {
    ElMessage.error('创建直播失败');
    creating.value = false;
  }
}

async function createLive() {
  if (dayjs(liveForm.value.startTime).isBefore(dayjs())) {
    ElMessage.error('开始时间不能早于当前时间');
    creating.value = false;
    return;
  }
  const serverTime = await getServerTime();
  if (!serverTime) {
    ElMessage.error('获取服务器时间失败');
    creating.value = false;
    return;
  }
  const id = randomString(2, true);
  liveForm.value.roomId = `${serverTime}${id}`;
  await getRoomId();
}

function getRoomId() {
  if (!plugin.value) {
    ElMessage.error('Janus 未连接，请检查直播服务');
    creating.value = false;
    return;
  }
  const data = {
    request: 'create',
    room: parseInt(liveForm.value.roomId),
    permanent: true,
    description: liveForm.value.title,
    bitrate: 2000000,
    publishers: liveForm.value.type == 1 ? 2 : config.smallClassNum + 1,
    videocodec: 'h264',
    audiocodec: 'opus',
    notify_joining: true,
    require_pvtid: true,
    audiolevel_ext: true,
    audiolevel_event: true,
    audio_level_average: 25,
    audio_active_packets: 500000
  };
  plugin.value.send({
    message: data,
    success: result => {
      if (result['videoroom'] && result['videoroom'] === 'created') {
        setWhiteBoard();
      }
    },
    error: () => {
      ElMessage.error('操作失败！');
      creating.value = false;
    }
  });
}

function setWhiteBoard() {
  const data = {
    textroom: 'create',
    transaction: randomString(8),
    room: parseInt(liveForm.value.roomId),
    permanent: true
  };
  boardPlugin.value?.data({
    text: JSON.stringify(data),
    error: () => {
      ElMessage.error('操作失败');
      creating.value = false;
      destroyLive();
    }
  });
}

function destroyLive() {
  const data = {
    request: 'destroy',
    room: parseInt(liveForm.value.roomId),
    permanent: true
  };
  plugin.value?.send({
    message: data,
    success: () => {},
    error: () => {}
  });
}

onMounted(async () => {
  try {
    if (!userStore.userInfo.userName) {
      await userStore.user_msg();
    }
    await init();
  } catch (e) {
    console.error('[createlive] Janus init failed:', e);
    ElMessage.error('直播服务初始化失败，请检查 Janus 服务是否启动');
  }
});

async function init() {
  await import('@/vendor/live/adapter/adapter.min');
  const adapterObj = window.adapter;

  const liveModule = await import('@/vendor/live/live');
  const JanusLive = liveModule.default;
  janusLib.value = JanusLive;

  JanusLive.init({
    debug: 'all',
    dependencies: JanusLive.useDefaultDependencies({ adapter: adapterObj }),
    callback: () => {
      room.value = new JanusLive({
        server: config.liveServer,
        success: () => {
          liveAttach();
          textAttach();
        },
        error: error => {
          ElMessage.error(String(error));
        }
      });
    }
  });
}

function liveAttach() {
  room.value?.attach({
    plugin: 'janus.plugin.videoroom',
    opaqueId: opaqueId.value,
    success: pluginHandle => {
      plugin.value = pluginHandle;
    },
    error: () => {},
    webrtcState: () => {},
    onmessage: () => {},
    onlocalstream: () => {},
    onremotestream: () => {},
    oncleanup: () => {}
  });
}

function textAttach() {
  room.value?.attach({
    plugin: 'janus.plugin.textroom',
    opaqueId: opaqueId.value,
    success: pluginHandle => {
      boardPlugin.value = pluginHandle;
      pluginTextSend({ request: 'setup' });
    },
    error: () => {},
    onmessage: (_msg, jsep) => {
      if (jsep) {
        boardPlugin.value?.createAnswer({
          jsep: jsep,
          media: {
            audio: false,
            video: false,
            data: true
          },
          success: answerJsep => {
            pluginTextSend({ request: 'ack' }, answerJsep);
          },
          error: () => {}
        });
      }
    },
    ondataopen: () => {},
    ondata: data => {
      const json = JSON.parse(data) as { textroom?: string };
      if (json.textroom === 'success') {
        void LiveCreate();
      }
    },
    oncleanup: () => {}
  });
}

function pluginTextSend(data: Record<string, unknown>, jsep?: unknown) {
  const options: { message: Record<string, unknown>; jsep?: unknown } = {
    message: data
  };
  if (jsep) options.jsep = jsep;
  boardPlugin.value?.send(options);
}

const { getServerTime } = useServerTime();
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.create-live {
  min-height: 554px;
  height: auto;

  .create-form {
    width: 60%;
    margin-left: 20px;

    .el-form {
      margin-left: 30px;
      margin-top: 40px;
    }
  }
  .el-button {
    position: absolute;
    right: 36px;
    bottom: 36px;
  }
}
.class-type {
  min-width: 190px;
  width: 48%;
  height: 120px;
  border: 1px solid #dcdcdc;
  cursor: pointer;

  > div {
    margin: 12px 16px;

    > h4 {
      color: @color-333333;
      font-size: @fs14;
      margin: 0;
      font-family:
        PingFangSC-Medium,
        PingFang SC;
      font-weight: 500;
    }
    > p {
      margin: 0;
      font-size: @fs12;
      color: @color-666666;
      width: 158px;
      font-weight: 400;
      line-height: 17px;
    }
  }
}
.class-type.small {
  background: url('~@/assets/imgs/backstage/xiaoban.png') center;
  background-size: 102% 103%;
}
.class-type.big {
  background: url('~@/assets/imgs/backstage/daban.png') center;
  background-size: 102% 103%;
}
.class-type.small.checked {
  border: 1px solid @color-1989fa;
}
.class-type.big.checked {
  border: 1px solid @color-1989fa;
}
.live-type {
  min-width: 400px;
  display: flex;
  justify-content: space-between;
}
</style>

<style lang="less">
@import '~@/assets/styles/pages/noscope.less';
.el-date-picker__editor-wrap .el-input.el-input--small .el-input__inner {
  min-width: auto;
}
.el-button.el-picker-panel__link-btn.el-button--text.el-button--mini {
  display: none;
}
</style>
