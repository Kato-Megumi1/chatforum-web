<template>
  <div class="assistant-composer">
    <el-input class="chat-textarea" :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" type="textarea"
      :autosize="{ minRows: 2, maxRows: 7 }" placeholder="发消息、提问题，或描述你想完成的事…" :disabled="busy"
      @keydown.enter="emit('enter', $event)" aria-label="消息输入" />
    <div class="composer-bottom">
      <div class="composer-tools">
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
      <button v-if="busy" class="composer-send stop" aria-label="停止生成" @click="emit('stop')"><span></span></button>
      <button v-else class="composer-send btn-send" aria-label="发送消息" :disabled="!modelValue.trim()" @pointerdown.prevent @click="emit('send')"><el-icon><Top /></el-icon></button>
    </div>
    <div v-if="coding && mode === 'agent'" class="coding-attached"><el-icon><FolderOpened /></el-icon>已连接当前会话的私有代码工作区 <button aria-label="停用编程工具" @click="emit('disableCoding')" :disabled="busy">×</button></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string; mode: string; busy: boolean; coding: boolean; knowledgeBaseId: number; knowledgeBases: any[] }>();
const emit = defineEmits(['update:modelValue', 'update:mode', 'update:knowledgeBaseId', 'enter', 'send', 'stop', 'settings', 'coding', 'disableCoding']);
</script>

<style scoped>
.assistant-composer { width: 100%; padding: 17px 18px 12px; border: 1px solid #e8e8ec; background: #fff; border-radius: 25px; box-shadow: 0 5px 28px #22243b0a; box-sizing: border-box; }
.assistant-composer:focus-within { border-color: #c8cbd5; box-shadow: 0 5px 28px #22243b10; }
.assistant-composer :deep(.el-textarea__inner) { box-shadow: none; background: transparent; resize: none; padding: 2px 6px 12px; font-size: 16px; line-height: 1.7; color: #25272c; }
.assistant-composer :deep(.el-textarea__inner::placeholder) { color: #a4a6ad; }
.composer-bottom { display: flex; align-items: flex-end; gap: 10px; justify-content: space-between; }
.composer-tools { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-width: 0; }
.composer-modes { display: flex; padding: 3px; border-radius: 18px; background: #f4f4f6; gap: 2px; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; color: #686a73; }
button:disabled { cursor: not-allowed; opacity: .5; }
button:focus-visible { outline: 2px solid #668bdf; outline-offset: 2px; }
.composer-modes button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 11px; font-size: 13px; border-radius: 15px; }
.composer-modes button.selected { color: #242630; background: white; box-shadow: 0 1px 4px #0000000d; }
.tool-pill { border-radius: 16px; font-size: 13px; padding: 8px 9px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.tool-pill:hover { background: #f5f5f7; color: #252731; }
.tool-pill.enabled { background: #edf3ff; color: #3a61a9; }
.code-symbol { font-size: 13px; font-weight: 600; }
.composer-send { display: flex; align-items: center; justify-content: center; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; background: #24252a; color: white; font-size: 20px; }
.composer-send:disabled { background: #eeeef0; color: #b5b5bc; opacity: 1; }
.stop span { width: 11px; height: 11px; background: white; border-radius: 2px; }
.coding-attached { display: flex; align-items: center; gap: 6px; margin: 11px 5px 0; padding-top: 9px; border-top: 1px solid #f0f0f3; font-size: 11px; color: #9295a0; }
.coding-attached button { margin-left: auto; font-size: 18px; }
.composer-kb-label { font-size: 13px; color: #777; margin-bottom: 10px; }
@media(max-width: 900px) { .assistant-composer { border-radius: 21px; padding: 13px 12px 10px; } .composer-tools { gap: 2px; } .tool-pill { font-size: 12px; padding: 7px; } .composer-modes button { padding: 6px 8px; font-size: 12px; } .settings-tool { display: none; } .composer-send { align-self: flex-end; } .coding-attached { font-size: 10px; } }
@media(max-width: 370px) { .composer-tools { max-width: 230px; } }
</style>
