<template>
  <el-dialog
    :model-value="modelValue"
    title="设置"
    width="600"
    class="settings-dialog"
    :close-on-click-modal="false"
    @closed="resetForm"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="settings-layout">
      <!-- 左侧菜单 -->
      <div class="settings-menu">
        <el-menu
          :default-active="activeMenu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="username">
            修改用户名
          </el-menu-item>
          <el-menu-item index="device">
            设备检测
          </el-menu-item>
          <el-menu-item index="password">
            修改密码
          </el-menu-item>
          <el-menu-item index="logout">
            退出登录
          </el-menu-item>
        </el-menu>
      </div>

      <!-- 右侧内容 -->
      <div
        ref="contentRef"
        class="settings-content"
        @scroll="handleScroll"
      >
        <!-- 修改用户名 -->
        <div
          id="section-username"
          class="section"
        >
          <h4 class="section-title">
            修改用户名
          </h4>
          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-width="80px"
          >
            <el-form-item
              label="用户名"
              prop="userName"
            >
              <div class="username-row">
                <el-input v-model="form.userName" />
                <el-button
                  type="primary"
                  :loading="loading"
                  @click="handleSubmit"
                >
                  保存
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </div>

        <!-- 设备检测 -->
        <div
          id="section-device"
          class="section section-device"
        >
          <h4 class="section-title">
            设备检测
          </h4>
          <EquipmentTestPanel />
        </div>

        <!-- 修改密码 -->
        <div
          id="section-password"
          class="section"
        >
          <h4 class="section-title">
            修改密码
          </h4>
          <el-form
            ref="passFormRef"
            :model="passForm"
            :rules="passRules"
            label-width="80px"
          >
            <el-form-item
              label="旧密码"
              prop="oldPassword"
            >
              <el-input
                v-model="passForm.oldPassword"
                :type="showOldPass ? 'text' : 'password'"
              >
                <template #suffix>
                  <el-icon
                    v-if="showOldPass"
                    :size="16"
                    style="cursor: pointer"
                    @click="showOldPass = false"
                  >
                    <View />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="16"
                    style="cursor: pointer"
                    @click="showOldPass = true"
                  >
                    <Hide />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item
              label="新密码"
              prop="password"
            >
              <el-input
                v-model="passForm.password"
                :type="showNewPass ? 'text' : 'password'"
              >
                <template #suffix>
                  <el-icon
                    v-if="showNewPass"
                    :size="16"
                    style="cursor: pointer"
                    @click="showNewPass = false"
                  >
                    <View />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="16"
                    style="cursor: pointer"
                    @click="showNewPass = true"
                  >
                    <Hide />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item
              label="确认密码"
              prop="repassword"
            >
              <el-input
                v-model="passForm.repassword"
                :type="showRePass ? 'text' : 'password'"
              >
                <template #suffix>
                  <el-icon
                    v-if="showRePass"
                    :size="16"
                    style="cursor: pointer"
                    @click="showRePass = false"
                  >
                    <View />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="16"
                    style="cursor: pointer"
                    @click="showRePass = true"
                  >
                    <Hide />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                :loading="passLoading"
                @click="handlePassSubmit"
              >
                确定
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 退出登录 -->
        <div
          id="section-logout"
          class="section logout-panel"
        >
          <h4 class="section-title">
            退出登录
          </h4>
          <p>确定要退出当前账号吗？</p>
          <el-button
            type="danger"
            @click="handleLogout"
          >
            退出登录
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { useUserStore } from '@/store/user';
import { isVoid, isCheckedAllRules } from '@yunyan-live/validation';
import EquipmentTestPanel from '@/components/LandingPage/EquipmentTestPanel.vue';

defineProps<{
  modelValue: boolean;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
  success: [];
}>();

const userStore = useUserStore();
const router = useRouter();

const activeMenu = ref('username');
const loading = ref(false);
const passLoading = ref(false);
const formRef = ref<FormInstance>();
const passFormRef = ref<FormInstance>();
const contentRef = ref<HTMLDivElement>();
const isScrolling = ref(false);

const form = reactive({ userName: '' });
const passForm = reactive({ oldPassword: '', password: '', repassword: '' });
const showOldPass = ref(false);
const showNewPass = ref(false);
const showRePass = ref(false);

let observer: IntersectionObserver | null = null;

const menuOrder = ['username', 'device', 'password', 'logout'];

const rules: FormRules = {
  userName: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (isVoid(value)) {
          callback(new Error('请输入用户名'));
        } else if (!isCheckedAllRules(value, 'commonName')) {
          callback(new Error('限制2～15位'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

const passRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ],
  repassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== passForm.password) {
          callback(new Error('两次输入密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

function handleMenuSelect(index: string) {
  activeMenu.value = index;
  const el = document.getElementById(`section-${index}`);
  if (el && contentRef.value) {
    isScrolling.value = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      isScrolling.value = false;
    }, 500);
  }
}

function handleScroll() {
  if (isScrolling.value) return;
  updateActiveMenuByScroll();
}

function updateActiveMenuByScroll() {
  if (!contentRef.value) return;
  const container = contentRef.value;
  const scrollTop = container.scrollTop;
  const containerHeight = container.clientHeight;

  for (const id of menuOrder) {
    const el = document.getElementById(`section-${id}`);
    if (!el) continue;
    const offsetTop = el.offsetTop - container.offsetTop;
    const offsetBottom = offsetTop + el.offsetHeight;
    if (scrollTop + containerHeight / 2 >= offsetTop && scrollTop + containerHeight / 2 < offsetBottom) {
      activeMenu.value = id;
      break;
    }
  }
}

function initObserver() {
  if (!contentRef.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (isScrolling.value) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('section-', '');
          if (menuOrder.includes(id)) {
            activeMenu.value = id;
          }
        }
      }
    },
    {
      root: contentRef.value,
      threshold: 0.4,
    }
  );

  for (const id of menuOrder) {
    const el = document.getElementById(`section-${id}`);
    if (el) observer.observe(el);
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    await api.update_user_name({ userName: form.userName });
    userStore.setName(form.userName);
    ElMessage.success('设置成功');
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : null)
      || (error as Record<string, unknown>)?.message
      || (error as Record<string, unknown>)?.msg
      || '修改失败';
    ElMessage.error(msg);
  } finally {
    loading.value = false;
  }
}

async function handlePassSubmit() {
  const valid = await passFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  passLoading.value = true;
  try {
    await api.change_password({
      oldPassword: passForm.oldPassword,
      password: passForm.password
    });
    ElMessage.success('修改成功，请重新登录');
    await handleLogout();
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : null)
      || (error as Record<string, unknown>)?.message
      || (error as Record<string, unknown>)?.msg
      || '修改失败';
    ElMessage.error(msg);
  } finally {
    passLoading.value = false;
  }
}

async function handleLogout() {
  await userStore.login_out({ token: userStore.token, guid: userStore.guid });
  localStorage.removeItem('role');
  void router.push('/login');
}

function resetForm() {
  activeMenu.value = 'username';
  form.userName = userStore.userInfo.userName;
  formRef.value?.clearValidate();
  passForm.oldPassword = '';
  passForm.password = '';
  passForm.repassword = '';
  showOldPass.value = false;
  showNewPass.value = false;
  showRePass.value = false;
  passFormRef.value?.clearValidate();
  if (contentRef.value) {
    contentRef.value.scrollTop = 0;
  }
}

nextTick(() => {
  initObserver();
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<style lang="less">
.settings-dialog .el-dialog {
  width: 600px !important;
}

.settings-dialog .el-dialog__body {
  display: block;
  width: 600px;
  padding: 0;
  overflow: hidden;
}

.settings-layout {
  display: flex;
  height: 380px;
}

.settings-menu {
  width: 130px;
  min-width: 130px;
  max-width: 130px;
  flex-shrink: 0;
  border-right: 1px solid #e4e7ed;

  .el-menu {
    border-right: none;
  }

  .el-menu-item {
    font-size: 13px;
    height: 44px;
    line-height: 44px;
  }
}

.settings-content {
  width: 470px;
  min-width: 470px;
  max-width: 470px;
  height: 380px;
  padding: 20px;
  overflow-y: auto;
  scroll-behavior: smooth;
  box-sizing: border-box;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.section {
  padding-top: 20px;
  padding-bottom: 20px;
  margin-bottom: 0;
  border-bottom: 1px solid #e4e7ed;

  &:first-child {
    padding-top: 0;
  }

  &:last-child {
    border-bottom: none;
  }
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f0f0;
}

.section-device {
  padding-top: 10px;

  .section-title {
    margin-bottom: 10px;
  }
}

.username-row {
  display: flex;
  gap: 10px;
  width: 280px;

  .el-input {
    flex: 1;
  }
}

.logout-panel {
  text-align: center;
  padding-top: 20px;

  .section-title {
    text-align: left;
  }

  p {
    color: #666;
    margin-bottom: 20px;
  }
}
</style>
