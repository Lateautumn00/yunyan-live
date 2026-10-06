<template>
  <div>
    <sidebar-menu :active-key="activeKey" />
    <div class="backstage-center transfer-page">
      <h3>转让管理</h3>
      <div class="transfer-form">
        <div class="form-row">
          <label>直播间ID</label>
          <el-input v-model="roomId" placeholder="请输入要接收的直播间ID" style="width: 300px" />
        </div>
        <el-button type="primary" :disabled="!roomId" :loading="generating" @click="generateCode">
          生成转移码
        </el-button>
      </div>
      <div v-if="transferCode" class="code-result">
        <div class="code-info">
          <span class="label">转移码：</span>
          <span class="code">{{ transferCode }}</span>
          <el-icon class="copy" aria-label="复制" @click="copyCode">
            <CopyDocument />
          </el-icon>
        </div>
        <div class="expire-info">有效期至：{{ expireTime }}</div>
        <div class="tip">
          请将此码和直播间ID告诉对方，对方在「我的直播」→「转移」中输入即可完成转移
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import SidebarMenu from '@/layouts/sidebar.vue';
import Live from '@/api/backstage';
import { useCopy } from '@/composables/useCopy';
import { useAsyncAction } from '@/composables/useAsyncAction';

const activeKey = '4';
const roomId = ref('');
const transferCode = ref('');
const expireTime = ref('');

const { loading: generating, run: runGenerate } = useAsyncAction(
  async () => {
    const res = await Live.generate_transfer_code({ roomId: roomId.value });
    const data = res.data as { transfer_code: string; expires_at: string };
    transferCode.value = data.transfer_code;
    expireTime.value = new Date(data.expires_at).toLocaleString();
    ElMessage.success('转移码生成成功');
  },
  { fallbackMessage: '生成失败' }
);

async function generateCode() {
  if (!roomId.value) return;
  await runGenerate();
}

const { copy } = useCopy();

function copyCode() {
  if (transferCode.value) void copy(transferCode.value);
}
</script>

<style lang="less" scoped>
@import '~@/assets/styles/common/mixin.less';

.transfer-page {
  background: #f8f8f8;
  box-shadow: none;
}

.transfer-form {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;

  > label {
    flex-shrink: 0;
    font-size: @fs14;
    font-weight: bold;
    color: @color-2c2c34;
  }
}

.code-result {
  margin-top: 24px;
  padding: 20px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0px 2px 12px 0px rgba(0, 0, 0, 0.03);
}

.code-info {
  display: flex;
  align-items: center;

  .label {
    font-size: @fs14;
    color: @color-2c2c34;
  }

  .code {
    font-size: 20px;
    font-weight: bold;
    color: @color-286bff;
    letter-spacing: 2px;
  }

  .copy {
    font-size: 16px;
    margin-left: 8px;
    cursor: pointer;
  }
}

.expire-info {
  margin-top: 12px;
  font-size: 13px;
  color: #999;
}

.tip {
  margin-top: 12px;
  font-size: 13px;
  color: #666;
}
</style>
