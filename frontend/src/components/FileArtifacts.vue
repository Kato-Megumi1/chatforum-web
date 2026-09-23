<template>
  <div v-if="artifacts?.length" class="file-artifacts" aria-label="生成的文件">
    <article v-for="file in artifacts" :key="file.changeId" class="artifact-card">
      <el-icon class="artifact-icon"><Document /></el-icon>
      <div><strong>{{ file.path }}</strong><small>独立修改版 · 原附件保留<span v-if="/\.(pdf|docx)$/i.test(file.path)"> · 基础排版</span></small></div>
      <button :disabled="busy" @click="download(file)" :aria-label="'下载修改版 ' + file.path"><el-icon><Download /></el-icon>下载</button>
    </article>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import request from '@/utils/request';
import { downloadChatFile } from '@/utils/chat-files';
const props = defineProps<{ conversationId: number; artifacts?: Array<{changeId:number;path:string}> }>();
const busy = ref(false);
async function download(file:{changeId:number;path:string}) {
  if (busy.value) return;
  const cid = props.conversationId; busy.value = true;
  try {
    const saved = await request.get<Blob>(`/coding/${cid}/changes/${file.changeId}/download`,{responseType:'blob',timeout:60000});
    if (props.conversationId === cid) downloadChatFile(file.path, saved);
  } catch(e:any) { ElMessage.error(e.message || '下载失败，请重试'); }
  finally { busy.value = false; }
}
</script>
<style scoped>
.file-artifacts { display:grid;gap:9px;margin-top:14px;max-width:500px; }.artifact-card { display:flex;align-items:center;gap:12px;border:1px solid #ccd8e7;background:#f5f8fc;border-radius:14px;padding:13px; }.artifact-icon { font-size:25px;color:#426ba2; }.artifact-card>div { flex:1;min-width:0; }.artifact-card strong { display:block;font-size:13px;overflow-wrap:anywhere;color:#2c405c; }.artifact-card small { display:block;font-size:11px;color:#66778f;margin-top:4px; }.artifact-card button { display:flex;gap:4px;align-items:center;border:1px solid #d0dced;border-radius:9px;padding:8px;background:white;color:#315e99;cursor:pointer;flex-shrink:0; }.artifact-card button:disabled { opacity:.5;cursor:wait; }
</style>
