<template>
  <div v-if="pending || progress || generation?.truncated" class="generation-status">
    <span v-if="pending" role="status">{{ stageLabel }}<span v-if="progress"> · {{ seconds(progress.elapsedMs) }} 秒</span></span>
    <details v-else-if="progress" class="generation-timing">
      <summary>用时 {{ seconds(progress.elapsedMs) }} 秒</summary>
      <div v-if="progress.firstTokenMs !== null">首段输出 {{ seconds(progress.firstTokenMs) }} 秒</div>
      <div v-for="phase in progress.stages" :key="phase.stage">{{ labels[phase.stage] || '处理' }} {{ seconds(phase.durationMs) }} 秒</div>
    </details>
    <button v-if="!pending && generation?.truncated && generation?.canContinue" :disabled="busy" @click="$emit('continue')">继续生成</button>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { GenerationProgress } from '@/utils/chat-stream';
const props = defineProps<{ pending?: boolean; busy?: boolean; progress?: GenerationProgress;
  generation?: {truncated: boolean; canContinue: boolean} }>();
defineEmits<{ continue: [] }>();
const labels: Record<string,string> = {preparing:'整理上下文',generating:'生成回答',tools:'处理任务',verifying:'核对依据',completed:'完成'};
const stageLabel = computed(() => labels[props.progress?.stage || 'preparing']);
const seconds = (ms: number) => (Math.max(0,ms)/1000).toFixed(1);
</script>
<style scoped>
.generation-status { display:flex;align-items:flex-start;gap:12px;margin-top:8px;font-size:12px;color:#8190a5;line-height:1.7; }
.generation-timing summary { cursor:pointer;list-style:none; }
.generation-timing summary::after { content:' ⌄'; }
.generation-timing[open] summary { margin-bottom:5px; }
button { border:1px solid #cbd7e8;border-radius:14px;background:#fff;padding:2px 11px;color:#3b638e;cursor:pointer; }
button:disabled { opacity:.5;cursor:default; }
</style>
