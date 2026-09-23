<template>
  <div class="assistant-composer">
    <div v-if="files?.length" class="attachment-list" aria-label="会话附件">
      <button v-for="file in files" :key="file.path" class="attachment-chip" @click="emit('files')" :title="file.path"><el-icon><Document /></el-icon><span>{{ file.path }}</span><small>v{{ file.revision }}</small></button>
    </div>
    <el-input class="chat-textarea" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" type="textarea"
      :autosize="{ minRows: 2, maxRows: 7 }" placeholder="发消息、提问题，或描述你想完成的事…" :disabled="busy"
      @keydown.enter="emit('enter', $event)" aria-label="消息输入" />
    <div class="composer-bottom">
      <div class="composer-tools">
        <el-popover placement="top-start" :width="285" trigger="click">
          <template #reference><button class="add-file" aria-label="添加文件" :disabled="busy || uploading"><el-icon><Plus /></el-icon></button></template>
          <button class="upload-file-menu" :disabled="busy || uploading" @click="fileInput?.click()"><el-icon><Upload /></el-icon>{{ uploading ? '正在上传…' : '上传文件' }}</button>
          <p class="upload-file-hint">图片、PDF、Word（DOCX）每个20MB；文本/代码64KB。图片与扫描PDF需选择Qwen。相关内容会发给所选模型，请勿上传密钥或私密资料。修改版可下载，原件保留。</p>
        </el-popover>
        <input ref="fileInput" type="file" :accept="CHAT_FILE_ACCEPT" multiple hidden @change="chooseFiles" />
        <div class="composer-modes" role="group" aria-label="回答模式">
          <button :class="{ selected: mode === 'normal' }" :aria-pressed="mode === 'normal'" :disabled="busy" @click="emit('update:mode', 'normal')">普通</button>
          <button :class="{ selected: mode === 'agent' }" :aria-pressed="mode === 'agent'" :disabled="busy" @click="emit('update:mode', 'agent')"><el-icon><MagicStick /></el-icon>Agent</button>
        </div>
        <button class="tool-pill coding-button" :class="{ enabled: coding && mode === 'agent' }" @click="emit('coding')" :disabled="busy" aria-label="打开编程 Agent 工作区"><span class="code-symbol">&lt;/&gt;</span>编程 Agent</button>
        <el-popover placement="top" :width="280" trigger="click">
          <template #reference><button class="tool-pill" :class="{ enabled: knowledgeBaseId > 0 }" :disabled="busy"><el-icon><Collection /></el-icon>知识库</button></template>
          <div class="composer-kb-label">补充参考资料</div>
          <el-select :model-value="knowledgeBaseId" @update:model-value="emit('update:knowledgeBaseId', $event)" style="width: 100%" aria-label="选择知识库">
            <el-option label="不使用知识库" :value="0" />
            <el-option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id" :label="kb.name" :disabled="!kb.chatReady" />
          </el-select>
        </el-popover>
        <button class="tool-pill settings-tool" aria-label="模型设置" @click="emit('settings')"><el-icon><Setting /></el-icon></button>
      </div>
      <button v-if="busy && !uploading" class="composer-send stop" aria-label="停止生成" @click="emit('stop')"><span></span></button>
      <button v-else class="composer-send btn-send" aria-label="发送消息" :disabled="!modelValue.trim() || uploading" @pointerdown.prevent @click="emit('send')"><el-icon><Top /></el-icon></button>
    </div>
    <div v-if="coding" class="coding-attached"><el-icon><FolderOpened /></el-icon><a href="#" @click.prevent="emit('files')">{{ files?.length ? `${files.length} 个会话文件 · 查看 / 下载` : '可生成文件 · 查看会话文件' }}</a><button aria-label="停用文件工具" @click="emit('disableCoding')" :disabled="busy">×</button></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CHAT_FILE_ACCEPT } from '@/utils/chat-files';
defineProps<{ modelValue: string; mode: string; busy: boolean; coding: boolean; files?: Array<{path:string;revision:number}>; uploading?: boolean; knowledgeBaseId: number; knowledgeBases: any[] }>();
const fileInput = ref<HTMLInputElement>();
const emit = defineEmits(['update:modelValue', 'update:mode', 'update:knowledgeBaseId', 'enter', 'send', 'stop', 'settings', 'coding', 'disableCoding', 'upload', 'files']);
function chooseFiles(event:Event) { const input=event.target as HTMLInputElement; const files=Array.from(input.files||[]);input.value='';if(files.length)emit('upload',files); }
</script>

<style scoped>
.assistant-composer { width: 100%; padding: 17px 18px 12px; border: 1px solid #b7c7dc; background: #fff; border-radius: 25px; box-shadow: 0 6px 24px #253f6212, 0 1px 3px #253f6208; box-sizing: border-box; }
.assistant-composer:focus-within { border-color: #6084b7; box-shadow: 0 0 0 3px #557fb514, 0 6px 24px #253f6212; }
.assistant-composer :deep(.el-textarea__inner) { box-shadow: none; background: transparent; resize: none; padding: 2px 6px 12px; font-size: 16px; line-height: 1.7; color: #202733; }
.assistant-composer :deep(.el-textarea__inner::placeholder) { color: #657287; }
.composer-bottom { display: flex; align-items: flex-end; gap: 10px; justify-content: space-between; }
.add-file { display:grid;place-items:center;width:33px;height:33px;border-radius:50%;background:#e8edf4;font-size:22px;color:#334a68;flex-shrink:0; }
.upload-file-menu { width:100%;display:flex;gap:9px;align-items:center;padding:12px;border:0;background:#f2f5fa;border-radius:9px;color:#273c59;cursor:pointer;font-size:14px; }
.upload-file-hint { font-size:11px;line-height:1.7;color:#6a778a;margin:10px 3px 2px; }
.attachment-list { display:flex;gap:8px;overflow-x:auto;padding:0 4px 12px; }
.attachment-chip { display:flex;align-items:center;gap:7px;flex-shrink:0;max-width:230px;border:1px solid #d4dfed;background:#f3f6fb;border-radius:11px;padding:9px 11px;font-size:12px; }
.attachment-chip span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.attachment-chip small { color:#708097; }
.composer-tools { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-width: 0; }
.composer-modes { display: flex; padding: 3px; border-radius: 18px; background: #e7ecf3; gap: 2px; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; color: #435166; }
button:disabled { cursor: not-allowed; opacity: .5; }
button:focus-visible { outline: 2px solid #668bdf; outline-offset: 2px; }
.composer-modes button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 11px; font-size: 13px; border-radius: 15px; }
.composer-modes button.selected { color: #203f6c; background: white; box-shadow: 0 1px 4px #253f6226; font-weight: 600; }
.tool-pill { border-radius: 16px; font-size: 13px; padding: 8px 9px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.tool-pill:hover { background: #eaf0f8; color: #243d62; }
.tool-pill.enabled { background: #e0eafa; color: #234f89; }
.code-symbol { font-size: 13px; font-weight: 600; }
.composer-send { display: flex; align-items: center; justify-content: center; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; background: #2d4d77; color: white; font-size: 20px; }
.composer-send:disabled { background: #e0e6ef; color: #77869b; opacity: 1; }
.stop span { width: 11px; height: 11px; background: white; border-radius: 2px; }
.coding-attached { display: flex; align-items: center; gap: 6px; margin: 11px 5px 0; padding-top: 9px; border-top: 1px solid #dce3ed; font-size: 12px; color: #596980; }
.coding-attached button { margin-left: auto; font-size: 18px; }
.coding-attached a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
.coding-attached a:hover { color: #234f89; text-decoration: underline; }
.composer-kb-label { font-size: 13px; color: #526177; margin-bottom: 10px; }
@media(max-width: 900px) { .assistant-composer { border-radius: 21px; padding: 13px 12px 10px; } .composer-tools { gap: 2px; } .tool-pill { font-size: 12px; padding: 7px; } .composer-modes button { padding: 6px 8px; font-size: 12px; } .settings-tool { display: none; } .composer-send { align-self: flex-end; } .coding-attached { font-size: 12px; } }
@media(max-width: 370px) { .composer-tools { max-width: 230px; } }
</style>
