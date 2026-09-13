<template>
  <div v-if="metadata && (metadata.citations?.length || !['roleplay', 'general'].includes(metadata.state))" class="rag-evidence">
    <div v-if="metadata.citations?.length" class="source-links">
      <el-button v-for="c in metadata.citations" :key="c.label" link type="primary" @click="openSource(c)">
        [{{ c.label }}] {{ c.chapter || c.fileName }} · 原文 v{{ c.documentVersion }}
      </el-button>
    </div>
    <details class="evidence-details">
      <summary>{{ metadata.interpretation ? '原文线索与角色理解' : metadata.state === 'needs_review' ? '有些细节尚未确认' : '回答依据' }}</summary>
    <el-tag size="small" :type="metadata.state === 'grounded' ? 'success' : 'info'">{{ stateLabel }}</el-tag>
    <span v-if="metadata.modelLabel" :title="metadata.model">{{ metadata.modelLabel }}</span>
    <span v-if="metadata.indexVersion">索引 v{{ metadata.indexVersion }}</span>
    <span v-if="metadata.graph">场景图谱 · {{ metadata.graph.facts || 0 }} 条辅助事实{{ metadata.graph.cached ? ' · 缓存' : '' }}</span>
    <span v-if="metadata.voiceFallback">原文事实转述（未采用扩写口吻）</span>
    <span v-if="metadata.voiceRepairs">角色表达修复 {{ metadata.voiceRepairs }} 次</span>
    <p v-if="metadata.interpretation">引用支持相关互动；对人物动机的理解不等于原作明确给出的唯一原因。</p>
    <p v-if="metadata.searchAttempts?.length">已尝试 {{ metadata.searchAttempts.length }} 轮检索。</p>
    <template v-if="metadata.diagnosticsVersion">
      <ol v-if="metadata.searchAttempts?.length" class="attempt-diagnostics">
        <li v-for="a in metadata.searchAttempts" :key="a.attempt">
          第 {{ a.attempt }} 轮：召回 {{ a.retrieved }} 段，重排保留 {{ a.retained }} 段 ·
          {{ a.outcome === 'grounded' ? '回答通过核验' : failureLabel(a.failure) }}
          <span v-if="a.historyReuse?.available">（含 {{ a.historyReuse.available }} 段重新读取的历史来源；本轮重新核验）</span>
          <span v-if="a.evidence?.sufficient === false">（模型判定证据不足）</span>
          <span v-if="a.evidence?.issues?.some((i: any) => i.code === 'QUOTE_NOT_VERBATIM')">（引用未逐字匹配）</span>
          <span v-if="a.evidence?.issues?.some((i: any) => i.code === 'QUOTE_TOO_LONG')">（引用超长）</span>
          <span v-if="a.voiceRepair">（表达修复{{ a.voiceRepair.outcome === 'passed' ? '通过' : a.voiceRepair.outcome === 'pending' ? '中断' : '未通过' }}）</span>
        </li>
      </ol>
      <p v-if="metadata.diagnostics?.finalFailure">本次结束于：{{ failureLabel(metadata.diagnostics.finalFailure) }}</p>
      <p v-if="metadata.historyEvidence?.length">
        历史来源：{{ historicalSourceCount }} 条回复保留了引用记录，{{ unverifiedHistoryCount }} 条回复没有历史核验标记。
        历史标记不代表本轮已核验。
      </p>
    </template>
    <p v-if="metadata.reviewTaskId">原文复核 #{{ metadata.reviewTaskId }} · 可在小说库中查看进度</p>
    </details>
    <el-dialog v-model="visible" title="原文依据" width="min(680px, 95vw)" append-to-body>
      <div v-loading="loading">
        <template v-if="source">
          <p>{{ source.fileName }} · 文档 v{{ source.documentVersion }} · 索引 v{{ source.indexVersion }}</p>
          <p>{{ source.chapter || '片段 ' + (source.chunkIndex + 1) }}<span v-if="source.page"> · 第 {{ source.page }} 页</span></p>
          <blockquote>{{ source.content }}</blockquote>
        </template>
        <el-alert v-else-if="!loading" title="引用不可访问，文档可能已撤回或权限发生变化。" type="warning" :closable="false" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import request from '@/utils/request';
const props = defineProps<{ metadata?: any }>();
const visible = ref(false), loading = ref(false), source = ref<any>(null);
const stateLabel = computed(() => ({ grounded: '已核对原文', roleplay: '角色模拟 / 日常互动', general: '普通对话',
  needs_review: '待原文复核' }[props.metadata?.state as string] || '角色记忆'));
const historicalSourceCount = computed(() => (props.metadata?.historyEvidence || []).filter((m: any) => m.kind === 'assistant_answer' && m.citations?.length).length);
const unverifiedHistoryCount = computed(() => (props.metadata?.historyEvidence || []).filter((m: any) => m.kind === 'assistant_answer' && m.verification === 'unverified').length);
function failureLabel(failure: any) {
  if (!failure) return '未记录失败分类';
  const labels: Record<string, string> = {
    NO_HITS: '检索未召回', LOW_RELEVANCE: '检索候选相关性不足', NO_ACTIVE_INDEX: '没有可用索引',
    NO_ACCESSIBLE_DOCUMENTS: '没有可访问的文档', SCOPE_NO_MATCH: '指定卷章未匹配',
    RETRIEVAL_DEGRADED_NO_HITS: '检索通道异常且无召回', EVIDENCE_INSUFFICIENT: '证据判定未通过',
    INVALID_EVIDENCE_FORMAT: '引用格式校验失败', INVALID_EVIDENCE_RESULT: '证据判定结果格式无效',
    INVALID_VOICE_MAPPING: '回答与事实映射失败', MISSING_ANSWER_FOCUS: '回答缺少问题要点',
    VERIFICATION_FAILED: '回答事实核验未通过', INJECTION_DETECTED: '安全校验未通过',
    QUESTION_TARGET_MISMATCH: '回答人物或事件未对齐', CHARACTER_VOICE_FAILED: '角色表达未通过',
    INVALID_VERIFICATION_RESULT: '核验结果缺少有效判定',
  };
  const stages: Record<string,string> = { routing:'分类', query_rewrite:'查询改写', retrieval:'检索', rerank:'重排',
    context:'场景上下文', evidence:'证据判定', quote_repair:'引用修复', voice:'回答表达', verification:'事实核验', delivery:'交付检查' };
  return labels[failure.code] || `${stages[failure.stage] || '处理'}阶段异常`;
}
async function openSource(c: any) {
  visible.value = true; loading.value = true; source.value = null;
  try {
    // Construct from IDs, never follow a model-generated URL with credentials.
    source.value = await request.get('/rag/knowledge-bases/' + props.metadata.knowledgeBaseId + '/citations/' + c.chunkId);
  } catch { source.value = null; }
  finally { loading.value = false; }
}
</script>

<style scoped>
.rag-evidence { margin-top: 10px; min-width: 0; max-width: 100%; font-size: 12px; color: #657083; }
.rag-evidence > span { margin-right: 10px; }
.evidence-details { margin-top: 6px; }
.evidence-details summary { cursor: pointer; color: #8492a6; font-size: 12px; }
.evidence-details[open] summary { margin-bottom: 8px; }
.evidence-details > span { margin-right: 10px; }
.attempt-diagnostics { margin: 8px 0; padding-left: 20px; line-height: 1.8; }
.source-links { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.source-links :deep(.el-button) {
  max-width: 100%; height: auto; margin-left: 0; padding: 2px 0;
  white-space: normal; line-height: 1.6; text-align: left;
}
.source-links :deep(.el-button > span) { display: block; min-width: 0; overflow-wrap: anywhere; }
blockquote { white-space: pre-wrap; line-height: 1.9; margin: 16px 0; padding: 16px; background: #f6f8fa; border-left: 3px solid #9aa6bf; }
</style>
