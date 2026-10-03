<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <img
          src="~@/assets/imgs/logo.png"
          alt="logo"
          width="40"
          height="40"
          style="border-radius: 50%"
        >
        <h2>云砚直播</h2>
      </div>

      <el-alert
        v-if="sessionNotice"
        :title="sessionNotice"
        :type="sessionNoticeType"
        show-icon
        :closable="false"
        class="session-alert"
      />

      <el-tabs
        v-model="activeTab"
        class="login-tabs"
      >
        <el-tab-pane
          label="登录"
          name="login"
        >
          <el-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            label-width="0"
          >
            <el-form-item prop="email">
              <el-input
                v-model="loginForm.email"
                placeholder="请输入邮箱"
                prefix-icon="Message"
              />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                :type="showPass ? 'text' : 'password'"
                placeholder="请输入密码"
                prefix-icon="Lock"
              >
                <template #suffix>
                  <el-icon
                    v-if="showPass"
                    :size="16"
                    style="cursor: pointer"
                    @click="showPass = false"
                  >
                    <View />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="16"
                    style="cursor: pointer"
                    @click="showPass = true"
                  >
                    <Hide />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div style="display: flex; justify-content: space-between; width: 100%">
                <el-checkbox v-model="rememberMe">
                  记住我
                </el-checkbox>
                <el-link
                  type="primary"
                  :underline="false"
                  @click="activeTab = 'forgot'"
                >
                  忘记密码?
                </el-link>
              </div>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                :loading="loginLoading"
                style="width: 100%"
                @click="handleLogin"
              >
                登录
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane
          label="注册"
          name="register"
        >
          <el-form
            ref="registerFormRef"
            :model="registerForm"
            :rules="registerRules"
            label-width="0"
          >
            <el-form-item prop="userName">
              <el-input
                v-model="registerForm.userName"
                placeholder="请输入用户名（2-15位字符）"
                prefix-icon="User"
              />
            </el-form-item>
            <el-form-item prop="email">
              <el-input
                v-model="registerForm.email"
                placeholder="请输入邮箱"
                prefix-icon="Message"
              />
            </el-form-item>
            <el-form-item prop="code">
              <div class="code-input">
                <el-input
                  v-model="registerForm.code"
                  placeholder="请输入验证码"
                />
                <el-button
                  :disabled="codeCountdown > 0"
                  @click="sendCode"
                >
                  {{ codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码' }}
                </el-button>
              </div>
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="registerForm.password"
                :type="showRegPass ? 'text' : 'password'"
                placeholder="请输入密码（6-16位字母数字）"
                prefix-icon="Lock"
              >
                <template #suffix>
                  <el-icon
                    v-if="showRegPass"
                    :size="16"
                    style="cursor: pointer"
                    @click="showRegPass = false"
                  >
                    <View />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="16"
                    style="cursor: pointer"
                    @click="showRegPass = true"
                  >
                    <Hide />
                  </el-icon>
                </template>
              </el-input>
              <div
                v-if="registerForm.password"
                class="password-strength"
              >
                <div class="strength-bar">
                  <div
                    class="strength-fill"
                    :style="{ width: strengthWidth, background: strengthColor }"
                  />
                </div>
                <span :style="{ color: strengthColor }">{{ strengthText }}</span>
              </div>
            </el-form-item>
            <el-form-item prop="repassword">
              <el-input
                v-model="registerForm.repassword"
                :type="showRegRePass ? 'text' : 'password'"
                placeholder="请确认密码"
                prefix-icon="Lock"
              >
                <template #suffix>
                  <el-icon
                    v-if="showRegRePass"
                    :size="16"
                    style="cursor: pointer"
                    @click="showRegRePass = false"
                  >
                    <View />
                  </el-icon>
                  <el-icon
                    v-else
                    :size="16"
                    style="cursor: pointer"
                    @click="showRegRePass = true"
                  >
                    <Hide />
                  </el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item prop="role">
              <el-radio-group v-model="registerForm.role">
                <el-radio :value="1">
                  老师
                </el-radio>
                <el-radio :value="2">
                  学生
                </el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                :loading="registerLoading"
                style="width: 100%"
                @click="handleRegister"
              >
                注册
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div
        v-if="activeTab === 'forgot'"
        class="forgot-form"
      >
        <el-link
          type="primary"
          :underline="false"
          class="back-link"
          @click="activeTab = 'login'"
        >
          ← 返回登录
        </el-link>
        <el-form
          ref="forgotFormRef"
          :model="forgotForm"
          :rules="forgotRules"
          label-width="0"
        >
          <el-form-item prop="email">
            <el-input
              v-model="forgotForm.email"
              placeholder="请输入注册邮箱"
              prefix-icon="Message"
            />
          </el-form-item>
          <el-form-item prop="code">
            <div class="code-input">
              <el-input
                v-model="forgotForm.code"
                placeholder="请输入验证码"
              />
              <el-button
                :disabled="forgotCountdown > 0"
                @click="sendForgotCode"
              >
                {{ forgotCountdown > 0 ? `${forgotCountdown}s` : '获取验证码' }}
              </el-button>
            </div>
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="forgotForm.password"
              :type="showForgotPass ? 'text' : 'password'"
              placeholder="请输入新密码（6位以上）"
              prefix-icon="Lock"
            >
              <template #suffix>
                <el-icon
                  v-if="showForgotPass"
                  :size="16"
                  style="cursor: pointer"
                  @click="showForgotPass = false"
                >
                  <View />
                </el-icon>
                <el-icon
                  v-else
                  :size="16"
                  style="cursor: pointer"
                  @click="showForgotPass = true"
                >
                  <Hide />
                </el-icon>
              </template>
            </el-input>
            <div
              v-if="forgotForm.password"
              class="password-strength"
            >
              <div class="strength-bar">
                <div
                  class="strength-fill"
                  :style="{ width: forgotStrengthWidth, background: forgotStrengthColor }"
                />
              </div>
              <span :style="{ color: forgotStrengthColor }">{{ forgotStrengthText }}</span>
            </div>
          </el-form-item>
          <el-form-item prop="repassword">
            <el-input
              v-model="forgotForm.repassword"
              :type="showForgotRePass ? 'text' : 'password'"
              placeholder="请确认新密码"
              prefix-icon="Lock"
            >
              <template #suffix>
                <el-icon
                  v-if="showForgotRePass"
                  :size="16"
                  style="cursor: pointer"
                  @click="showForgotRePass = false"
                >
                  <View />
                </el-icon>
                <el-icon
                  v-else
                  :size="16"
                  style="cursor: pointer"
                  @click="showForgotRePass = true"
                >
                  <Hide />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              :loading="forgotLoading"
              style="width: 100%"
              @click="handleResetPassword"
            >
              重置密码
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { extractErrorMessage } from '@yunyan-live/utils';
import { useUserStore } from '@/store/user';
import api from '@/api';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const sessionNotice = ref('');
const sessionNoticeType = computed<'warning' | 'error'>(() =>
  sessionNotice.value.includes('其他设备') ? 'error' : 'warning'
);

const activeTab = ref('login');
const showPass = ref(false);
const showRegPass = ref(false);
const showRegRePass = ref(false);
const showForgotPass = ref(false);
const showForgotRePass = ref(false);
const loginLoading = ref(false);
const registerLoading = ref(false);
const forgotLoading = ref(false);
const codeCountdown = ref(0);
const forgotCountdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let forgotCountdownTimer: ReturnType<typeof setInterval> | null = null;

const loginFormRef = ref<FormInstance>();
const registerFormRef = ref<FormInstance>();
const forgotFormRef = ref<FormInstance>();

const loginForm = reactive({
  email: '',
  password: ''
});

const rememberMe = ref(false);

const registerForm = reactive({
  userName: '',
  email: '',
  code: '',
  password: '',
  repassword: '',
  role: 2 as number
});

const forgotForm = reactive({
  email: '',
  code: '',
  password: '',
  repassword: ''
});

const loginRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

const registerRules: FormRules = {
  userName: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 15, message: '2-15位字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  code: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 16, message: '6-16位字符', trigger: 'blur' }
  ],
  repassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
};

const forgotRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  code: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ],
  repassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== forgotForm.password) {
          callback(new Error('两次输入密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

const strengthLevel = computed(() => {
  const p = registerForm.password;
  if (!p) return 0;
  let level = 0;
  if (p.length >= 6) level++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) level++;
  if (/[0-9]/.test(p) && /[a-zA-Z]/.test(p)) level++;
  if (/[^a-zA-Z0-9]/.test(p)) level++;
  if (p.length >= 10) level++;
  return Math.min(level, 3);
});

const strengthText = computed(() => {
  const texts = ['', '弱', '中', '强'];
  return texts[strengthLevel.value];
});

const strengthColor = computed(() => {
  const colors = ['', '#ff4d4f', '#faad14', '#52c41a'];
  return colors[strengthLevel.value];
});

const strengthWidth = computed(() => {
  const widths = ['0%', '33%', '66%', '100%'];
  return widths[strengthLevel.value];
});

const forgotStrengthLevel = computed(() => {
  const p = forgotForm.password;
  if (!p) return 0;
  let level = 0;
  if (p.length >= 6) level++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) level++;
  if (/[0-9]/.test(p) && /[a-zA-Z]/.test(p)) level++;
  if (/[^a-zA-Z0-9]/.test(p)) level++;
  if (p.length >= 10) level++;
  return Math.min(level, 3);
});

const forgotStrengthText = computed(() => {
  const texts = ['', '弱', '中', '强'];
  return texts[forgotStrengthLevel.value];
});

const forgotStrengthColor = computed(() => {
  const colors = ['', '#ff4d4f', '#faad14', '#52c41a'];
  return colors[forgotStrengthLevel.value];
});

const forgotStrengthWidth = computed(() => {
  const widths = ['0%', '33%', '66%', '100%'];
  return widths[forgotStrengthLevel.value];
});

onMounted(() => {
  const reason = route.query.reason;
  if (reason === 'kicked' || reason === 'expired') {
    sessionNotice.value =
      reason === 'kicked' ? '账号已在其他设备登录，请重新登录' : '登录已过期，请重新登录';
    void router.replace({ path: '/login' });
  }
  const savedEmail = localStorage.getItem('savedEmail');
  const savedPass = localStorage.getItem('savedPass');
  if (savedEmail) {
    loginForm.email = savedEmail;
    loginForm.password = savedPass || '';
    rememberMe.value = true;
  }
});

async function sendCode() {
  if (!registerForm.email) {
    ElMessage.warning('请先输入邮箱');
    return;
  }
  try {
    await api.email_code({ email: registerForm.email });
    ElMessage.success('验证码已发送');
    codeCountdown.value = 60;
    countdownTimer = setInterval(() => {
      codeCountdown.value--;
      if (codeCountdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }, 1000);
  } catch {
    ElMessage.error('发送验证码失败');
  }
}

async function handleLogin() {
  const valid = await loginFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  loginLoading.value = true;
  try {
    await userStore.login({
      email: loginForm.email,
      password: loginForm.password
    });
    if (userStore.token) {
      if (rememberMe.value) {
        localStorage.setItem('savedEmail', loginForm.email);
        localStorage.setItem('savedPass', loginForm.password);
      } else {
        localStorage.removeItem('savedEmail');
        localStorage.removeItem('savedPass');
      }
      const role = localStorage.getItem('role');
      if (role === '1') {
        router.push('/teacher/mylive');
      } else {
        router.push('/student/rooms');
      }
    } else {
      ElMessage.error('用户名或密码错误');
    }
  } finally {
    loginLoading.value = false;
  }
}

async function handleRegister() {
  const valid = await registerFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  registerLoading.value = true;
  try {
    await api.register({
      email: registerForm.email,
      userName: registerForm.userName,
      password: registerForm.password,
      role: registerForm.role,
      code: registerForm.code
    });
    ElMessage.success('注册成功，请登录');
    activeTab.value = 'login';
    loginForm.email = registerForm.email;
  } catch (error: unknown) {
    const msg = extractErrorMessage(error, '注册失败');
    ElMessage.error(msg);
  } finally {
    registerLoading.value = false;
  }
}

async function sendForgotCode() {
  if (!forgotForm.email) {
    ElMessage.warning('请先输入邮箱');
    return;
  }
  try {
    await api.email_code({ email: forgotForm.email });
    ElMessage.success('验证码已发送');
    forgotCountdown.value = 60;
    forgotCountdownTimer = setInterval(() => {
      forgotCountdown.value--;
      if (forgotCountdown.value <= 0 && forgotCountdownTimer) {
        clearInterval(forgotCountdownTimer);
        forgotCountdownTimer = null;
      }
    }, 1000);
  } catch {
    ElMessage.error('发送验证码失败');
  }
}

async function handleResetPassword() {
  const valid = await forgotFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  forgotLoading.value = true;
  try {
    await api.reset_password({
      email: forgotForm.email,
      code: forgotForm.code,
      password: forgotForm.password
    });
    ElMessage.success('密码重置成功，请重新登录');
    activeTab.value = 'login';
    loginForm.email = forgotForm.email;
  } catch (error: unknown) {
    const msg = extractErrorMessage(error, '重置失败');
    ElMessage.error(msg);
  } finally {
    forgotLoading.value = false;
  }
}
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.login-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-container {
  width: 400px;
  padding: 40px;
  background: @color-FFF;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.login-header {
  text-align: center;
  margin-bottom: 30px;

  h2 {
    margin-top: 10px;
    color: @color-333333;
    font-size: 24px;
  }
}

.session-alert {
  margin-bottom: 16px;
}

.login-tabs {
  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }
}

.code-input {
  display: flex;
  gap: 10px;
  width: 100%;

  .el-input {
    flex: 1;
  }

  .el-button {
    width: 120px;
  }
}

.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  width: 100%;

  .strength-bar {
    flex: 1;
    height: 4px;
    background: #eee;
    border-radius: 2px;
    overflow: hidden;

    .strength-fill {
      height: 100%;
      border-radius: 2px;
      transition: all 0.3s;
    }
  }

  span {
    font-size: 12px;
    min-width: 20px;
  }
}

.forgot-form {
  .back-link {
    margin-bottom: 16px;
    display: inline-block;
  }
}
</style>
