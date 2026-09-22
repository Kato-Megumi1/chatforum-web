<template>
  <div class="login-container" :style="{ backgroundImage: 'url(' + publicAsset('auth-bg-optimized.jpg') + ')' }">
    <div class="login-card">
      <div class="login-header">
        <el-icon :size="48" color="#165DFF">
          <ChatDotRound />
        </el-icon>
        <h1>ChatForum</h1>
        <p>智能对话与社区交流平台</p>
      </div>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
      >
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" prefix-icon="Message" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            @click="handleLogin"
            style="width: 100%"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="login-footer">
        <span>还没有账号?</span>
        <router-link to="/register">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { publicAsset } from '@/utils/api';
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  email: '',
  password: '',
});

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const handleLogin = async () => {
  try {
    await formRef.value?.validate();
    loading.value = true;
    await userStore.login(form.email, form.password);
    ElMessage.success('登录成功');
    router.push('/chat');
  } catch (error) {
    // Error already handled
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped>
.login-container {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 10%;
  background: center / cover no-repeat;
  position: relative;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 0;
  }
  .login-card {
    position: relative;
    z-index: 1;
  }
}

.login-card {
  width: 400px;
  padding: 48px 36px;
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;

  h1 {
    margin: 16px 0 8px;
    font-size: 24px;
    color: #303133;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #909399;
  }
}

.login-footer {
  text-align: center;
  font-size: 14px;
  color: #909399;

  a {
    color: #165DFF;
    text-decoration: none;
    margin-left: 4px;

    &:hover {
      text-decoration: underline;
    }
  }
}
@media (max-width: 640px) {
  .login-container { min-height: 100svh; height: auto; padding: 24px 16px 56px; justify-content: center; }
  .login-card { width: min(400px, 100%); padding: 30px 24px; }
  :deep(.el-input__inner) { font-size: 16px; }
  .login-card { border-radius: 26px; box-shadow: 0 12px 50px #38253626; }
  .login-card :deep(.el-input__wrapper) { min-height: 46px; border-radius: 12px; }
  .login-card :deep(.el-button--primary) { min-height: 46px; border-radius: 14px; background: #a66b83; border: 0; }
  .login-footer a { color: #a66b83; }
}
</style>
