<template>
  <div class="connection">
    <el-button text size="small" @click="visible = true">连接设置</el-button>
    <el-dialog v-model="visible" title="后端连接" width="min(480px, 95vw)" append-to-body>
      <p>异地访问时填写本机后端的 HTTPS 隧道地址，末尾加 /api。电脑与 Docker 需要保持运行。</p>
      <el-input v-model="address" placeholder="https://your-host.example/api" />
      <p v-if="result">{{ result }}</p>
      <template #footer>
        <el-button @click="check" :loading="checking">测试连接</el-button>
        <el-button type="primary" @click="save">保存并重新登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { API_BASE } from '@/utils/api';
const visible = ref(location.hostname.endsWith('.github.io') && API_BASE === '/api');
const address = ref(API_BASE), result = ref(''), checking = ref(false);
function valid() {
  if (address.value === '/api') return true;
  try {
    const u = new URL(address.value);
    return !u.username && !u.password && !u.search && !u.hash && u.pathname.replace(/\/$/, '') === '/api' &&
      (u.protocol === 'https:' || (import.meta.env.DEV && u.protocol === 'http:'));
  } catch { return false; }
}
async function check() {
  if (!valid()) return ElMessage.warning('请输入 HTTPS 地址，以 /api 结尾');
  checking.value = true; result.value = '';
  try {
    const r = await fetch(address.value.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(10000) });
    const body = await r.json();
    result.value = r.ok && body.success && body.data?.status === 'ok' ? '连接成功' : '后端服务尚未就绪';
  } catch { result.value = '无法连接：请检查 Docker、隧道和后端 CORS 配置'; }
  finally { checking.value = false; }
}
function save() {
  if (!valid()) return ElMessage.warning('请输入 HTTPS 地址，以 /api 结尾');
  localStorage.setItem('chatforum-api-base', address.value.replace(/\/$/, ''));
  localStorage.removeItem('chatforum-user');
  location.reload();
}
</script>
<style scoped>
.connection { position: fixed; right: 12px; bottom: max(8px, env(safe-area-inset-bottom)); z-index: 1500; background: white; border-radius: 8px; opacity: .95; }
</style>
