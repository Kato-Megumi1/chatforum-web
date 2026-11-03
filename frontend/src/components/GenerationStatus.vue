<template>
  <div v-if="pending || progress || generation?.truncated || hasDetails" class="generation-status">
    <details v-if="hasDetails" class="generation-process" :class="{ 'is-pending': pending }" :open="pending && planItems.some(item => item.status !== 'done')">
      <summary aria-label="工作进展">
        <span class="process-indicator" aria-hidden="true"></span><span class="process-current">{{ statusLabel }}</span>
        <span v-if="planItems.length" class="process-count">{{ completed }} / {{ planItems.length }}</span>
        <span v-if="view.elapsedMs !== null && !hideElapsed" class="process-elapsed">总用时 {{ seconds(view.elapsedMs) }} 秒</span>
        <span class="process-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="process-body">
        <p v-if="work?.plan?.summary" class="work-summary">{{ work.plan.summary }}</p>
        <CodingChecklist v-if="checklist?.items.length" :initial="checklist" :run-id="work?.runId || runId" :active="pending" embedded />
        <ol v-else-if="work?.plan?.items.length" class="task-plan" aria-label="任务计划">
          <li v-for="item in work.plan.items" :key="item.id" :class="'step-' + item.status">
            <span class="step-mark" role="img" :aria-label="workStatusLabels[item.status]">{{ item.status === 'done' ? '✓' : item.status === 'blocked' ? '!' : '·' }}</span>
            <div><span class="step-title">{{ item.title }}</span><p v-if="item.summary" class="step-summary">{{ item.summary }}</p></div>
            <span class="step-state">{{ workStatusLabels[item.status] }}</span>
          </li>
        </ol>
        <details v-if="work?.activities.length" class="work-receipts">
          <summary>执行记录 <span>{{ work.activities.length }}</span></summary>
          <ol><li v-for="item in work.activities" :key="item.id" :class="'receipt-' + item.status">
            <span aria-hidden="true">{{ item.status === 'done' ? '✓' : ['failed','blocked','uncertain'].includes(item.status) ? '!' : '·' }}</span>
            <span>{{ workActivityLabels[item.kind] }}</span><span>{{ workStatusLabels[item.status] }}</span>
          </li></ol>
        </details>
      </div>
    </details>
    <span v-else class="process-compact" :class="{ 'is-pending': pending }" role="status">
      <span class="process-indicator" aria-hidden="true"></span><span class="process-current">{{ statusLabel }}</span>
      <span v-if="view.elapsedMs !== null && !hideElapsed" class="process-elapsed">总用时 {{ seconds(view.elapsedMs) }} 秒</span>
    </span>
    <button v-if="!pending && generation?.truncated && generation?.canContinue" class="continue-generation" :disabled="busy" @click="$emit('continue')">{{ continuationLabel }}</button>
    <p v-if="!pending && generation?.fileIncomplete && !resumeFile" class="file-resume-unavailable">此回答未保留草稿，无法接着完成。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { GenerationProgress } from '@/utils/chat-stream';
import { generationProcessView, generationSeconds as seconds } from '@/utils/generation-process';
import { readFileResume, type FileResumePointer, type FileFailureReason } from '@/utils/file-resume';
import { readAgentWork, currentWorkAction, workActivityLabels, workStatusLabels } from '@/utils/agent-work';
import { readCodingChecklist } from '@/utils/coding-checklist';
import CodingChecklist from './CodingChecklist.vue';
const props = defineProps<{ pending?: boolean; busy?: boolean; progress?: GenerationProgress; runId?: string; agentWork?: unknown;
  codingChecklist?: unknown; hideElapsed?: boolean;
  generation?: {truncated: boolean; canContinue: boolean; fileIncomplete?: boolean; filePaths?: string[];
    fileFailureReason?: FileFailureReason; resumeFile?: FileResumePointer}; allowThinking?: boolean }>();
defineEmits<{ continue: [] }>();
const resumeFile = computed(() => readFileResume(props.generation?.resumeFile));
const continuationLabel = computed(() => props.generation?.fileIncomplete ? resumeFile.value ? '继续完成文件' : '重新生成文件' : '继续生成');
const work = computed(() => props.allowThinking ? readAgentWork(props.agentWork, props.runId) : undefined);
const checklist = computed(() => {
  if (!props.allowThinking) return undefined;
  try { return work.value?.codingChecklist || readCodingChecklist(props.codingChecklist, props.runId); } catch { return undefined; }
});
const planItems = computed(() => checklist.value?.items || work.value?.plan?.items || []);
const completed = computed(() => planItems.value.filter(item => item.status === 'done').length);
const hasDetails = computed(() => !!(planItems.value.length || work.value?.activities.length || work.value?.plan?.summary));
const activityLabels: Record<string, string> = {
  web_search: '正在搜索网页', forum_search: '正在查询社区', read_files: '正在读取附件', save_file: '正在保存文件',
  preview_html: '正在预览页面', review_html: '正在检查页面', repair_html: '正在修复页面',
  plan_task: '正在制定计划', update_plan: '正在更新计划', load_skill: '正在读取技能', check_file: '正在检查语法',
};
const now = ref(Date.now()), sampledAt = ref(now.value), baseElapsed = ref<number | null>(null);
let mounted = false, timer: ReturnType<typeof setInterval> | undefined;
const sourceView = () => generationProcessView(props.progress, !!props.pending, 0, !!props.allowThinking);
const stopClock = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
const syncClock = () => {
  stopClock();
  if (mounted && props.pending && sourceView().phase !== 'completed') timer = setInterval(() => { now.value = Date.now(); }, 250);
};
watch([() => props.runId, () => props.pending, () => props.progress], ([runId], previous) => {
  const observedAt = Date.now(), source = sourceView();
  const changedRun = !!previous && previous[0] !== runId;
  const before = changedRun || baseElapsed.value === null ? null : baseElapsed.value +
    (previous?.[1] && generationProcessView(previous[2], true, 0, !!props.allowThinking).phase !== 'completed' ? Math.max(0, observedAt - sampledAt.value) : 0);
  baseElapsed.value = source.elapsedMs === null ? before : Math.max(source.elapsedMs, before ?? 0);
  sampledAt.value = observedAt; now.value = observedAt; syncClock();
}, { immediate: true });
const view = computed(() => {
  const source = sourceView();
  const extension = props.pending && source.phase !== 'completed' ? Math.max(0, now.value - sampledAt.value) : 0;
  return { ...source, elapsedMs: baseElapsed.value === null ? null : baseElapsed.value + extension };
});
const statusLabel = computed(() => {
  if (!props.pending) return props.generation?.fileIncomplete ? '文件未完成' : hasDetails.value ? '工作进展' : view.value.label;
  // Only actual step receipts / server activities may name an operation. A
  // silent first model call has no plan or public summary to invent here.
  const actualAction = (props.allowThinking && props.progress?.activity && activityLabels[props.progress.activity]) || currentWorkAction(work.value);
  if (actualAction) return actualAction;
  if (view.value.phase === 'thinking') return '正在思考';
  if (view.value.phase === 'context' || view.value.phase === 'understanding') return '准备回答';
  if (view.value.phase === 'generating' && (props.progress?.activeModelCalls || 0) > 0 &&
      !props.progress?.modelOutput?.textChars && !props.progress?.modelOutput?.thinkingChars) return '等待模型响应';
  return view.value.label;
});
onMounted(() => { mounted = true; syncClock(); });
onUnmounted(() => { mounted = false; stopClock(); });
</script>
<style scoped>
.generation-status{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 12px;margin-top:8px;font-size:13px;color:#64758d;line-height:1.65}
.generation-process{width:680px;max-width:100%;min-width:0;border:1px solid #dce5ef;border-radius:12px;background:rgba(248,250,253,.8)}
.generation-process>summary,.process-compact{display:flex;align-items:center;gap:8px;min-height:36px;padding:7px 11px;box-sizing:border-box}
.generation-process>summary{cursor:pointer;list-style:none;user-select:none}.generation-process>summary::-webkit-details-marker{display:none}
summary:focus-visible{outline:2px solid #4b80b8;outline-offset:2px;border-radius:8px}.process-current{min-width:0;overflow-wrap:anywhere;color:#456487}
.process-count,.process-elapsed{font-variant-numeric:tabular-nums;white-space:nowrap;color:#7b8b9d;font-size:12px}.process-elapsed{margin-left:auto}
.process-chevron{font-size:16px;line-height:1;transition:transform .15s ease}.generation-process[open]>summary .process-chevron{transform:rotate(180deg)}
.process-indicator{width:6px;height:6px;border-radius:50%;background:#90a3b7;flex:none}.is-pending .process-indicator{background:#5b91c4;animation:process-pulse 1.6s ease-in-out infinite}
.process-body{padding:2px 13px 13px}.work-summary{margin:2px 0 12px;color:#405b78;line-height:1.75;overflow-wrap:anywhere;white-space:pre-wrap}
.task-plan{list-style:none;margin:0;padding:0;display:grid;gap:10px}.task-plan li{display:grid;grid-template-columns:17px minmax(0,1fr) auto;gap:8px;align-items:start}
.step-mark{display:grid;place-items:center;width:16px;height:16px;border:1px solid #c4d0dc;border-radius:50%;margin-top:3px;color:#8494a5;font-size:12px;line-height:1}
.step-done .step-mark{color:#2f8259;border-color:#a4d2bb;background:#edf7f1}.step-in_progress .step-mark{color:#3c76ad;border-color:#9ebedc;background:#edf4fb}.step-blocked .step-mark{color:#a37631;border-color:#dbc49e;background:#fff8ee}
.step-title{color:#354c65;overflow-wrap:anywhere}.step-state{font-size:11px;color:#8191a2;white-space:nowrap;padding-top:2px}.step-blocked .step-state{color:#a37631}
.step-summary{margin:2px 0 0;color:#6c7e92;font-size:12px;line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap}
.work-receipts{margin-top:12px;border-top:1px solid #e2e9f0;padding-top:8px}.work-receipts>summary{width:fit-content;cursor:pointer;color:#6b7f95;font-size:12px}
.work-receipts>summary span{font-variant-numeric:tabular-nums}.work-receipts ol{list-style:none;display:grid;gap:5px;padding:7px 0 0;margin:0;font-size:12px}
.work-receipts li{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:7px;color:#6b7f95}.receipt-done>span:first-child{color:#3e8464}.receipt-failed>span:first-child,.receipt-blocked>span:first-child,.receipt-uncertain>span:first-child{color:#a37631}
.continue-generation{border:1px solid #cbd7e8;border-radius:14px;background:#fff;padding:3px 11px;min-height:32px;color:#3b638e;cursor:pointer}.continue-generation:disabled{opacity:.5;cursor:default}
.file-resume-unavailable{flex-basis:100%;margin:0;color:#7b8b9d;font-size:12px}
@keyframes process-pulse{50%{opacity:.35}}
@media(max-width:900px){.generation-process>summary,.process-compact{min-height:40px;gap:6px;padding:7px 9px}.process-current{font-size:12px}.process-count,.process-elapsed{font-size:11px}.process-body{padding:2px 10px 11px}.step-state{font-size:10px}}
@media(prefers-reduced-motion:reduce){.is-pending .process-indicator{animation:none}.process-chevron{transition:none}}
</style>
