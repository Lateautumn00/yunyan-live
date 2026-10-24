<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { message } from '@/utils/message';
import { initRouter, getTopMenu } from '@/router/utils';
import { useUserStoreHook } from '@/store/modules/user';
import type { FormInstance } from 'element-plus';

defineOptions({ name: 'AdminLogin' });

const router = useRouter();
const loading = ref(false);
const disabled = ref(false);
const ruleFormRef = ref<FormInstance>();

const ruleForm = reactive({
  username: '',
  password: ''
});

const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

const onLogin = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  await formEl.validate(valid => {
    if (!valid) return;
    loading.value = true;
    useUserStoreHook()
      .loginByUsername({
        username: ruleForm.username,
        password: ruleForm.password
      })
      .then(async () => {
        await initRouter();
        disabled.value = true;
        router.push(getTopMenu(true).path).then(() => {
          message('登录成功', { type: 'success' });
        });
      })
      .catch(err => {
        message(err?.message || '登录失败，请检查用户名和密码', { type: 'error' });
      })
      .finally(() => {
        disabled.value = false;
        loading.value = false;
      });
  });
};
</script>

<template>
  <div class="admin-login-page">
    <div class="login-card">
      <h1 class="title">云砚直播 · 管理后台</h1>
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="loginRules" size="large">
        <el-form-item prop="username">
          <el-input v-model="ruleForm.username" placeholder="管理员用户名" clearable />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="ruleForm.password" placeholder="密码" show-password />
        </el-form-item>
        <el-form-item>
          <el-button
            class="w-full"
            type="primary"
            :loading="loading"
            :disabled="disabled"
            @click="onLogin(ruleFormRef)"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.admin-login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
}

.login-card {
  width: 400px;
  padding: 40px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.title {
  font-size: 20px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 32px;
  color: #303133;
}
</style>
