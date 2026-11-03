<template>
  <component :is="embedded ? 'div' : 'details'" v-if="ownsSession() && items.length" class="coding-checklist" :class="{ embedded }" :open="!embedded && active && items.some(item => item.status !== 'done')">
    <summary v-if="!embedded"><span>任务计划</span><span class="checklist-count">{{ completed }} / {{ items.length }}</span></summary>
    <ol>
      <li v-for="item in items" :key="item.id" :class="'checklist-' + item.status">
        <span class="checklist-mark" role="img" :aria-label="labels[item.status]">{{ item.status === 'done' ? '✓' : item.status === 'blocked' ? '!' : '·' }}</span>
        <div><span class="checklist-title">{{ item.title }}</span><p v-if="item.note">{{ item.note }}</p>
          <p v-if="item.paths?.length" class="checklist-paths"><code v-for="path in item.paths" :key="path">{{ path }}</code></p></div>
        <span class="checklist-state">{{ itemState(item) }}</span>
      </li>
    </ol>
  </component>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useUserStore } from '@/stores/user';
import { readCodingChecklist, type CodingChecklistItem } from '@/utils/coding-checklist';
const props = defineProps<{ conversationId?: number; runId?: string; initial?: unknown; active?: boolean; embedded?: boolean }>();
const user = useUserStore(), owner = user.getAuthSession(), live = ref(true);
const ownsSession = () => {
  const session = user.getAuthSession();
  return live.value && !!user.token && owner.userId !== null && session.userId === owner.userId && session.epoch === owner.epoch;
};
const snapshot = computed(() => {
  if (!ownsSession()) return undefined;
  try { return readCodingChecklist(props.initial, props.runId); } catch { return undefined; }
});
const items = computed(() => snapshot.value?.items || []);
const completed = computed(() => items.value.filter(item => item.status === 'done').length);
const labels = { pending: '未开始', in_progress: '进行中', done: '已完成', blocked: '受阻' };
const evidenceLabels: Record<string, string> = { file_read: '已读取', file_proposal: '已保存', syntax_check: '语法检查', visual_review: '视觉验收', self_reported: '已记录' };
const itemState = (item: CodingChecklistItem) => item.status === 'done'
  ? (evidenceLabels[item.verificationKind || ''] || labels.done) : labels[item.status];
onUnmounted(() => { live.value = false; });
</script>
<style scoped>
.coding-checklist{max-width:680px;margin:12px 0;border:1px solid #d9e3ed;border-radius:12px;background:#f8fafc;color:#354c65;font-size:13px}
.coding-checklist.embedded{max-width:none;margin:0;border:0;background:transparent}.coding-checklist.embedded ol{padding:0}
summary{display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;list-style:none;font-weight:500}
summary::-webkit-details-marker{display:none}summary::after{content:'⌄';margin-left:auto;color:#7b8b9c}.coding-checklist[open] summary::after{transform:rotate(180deg)}
.checklist-count{font-size:12px;color:#7a8b9c;font-variant-numeric:tabular-nums}
ol{list-style:none;margin:0;padding:0 14px 12px;display:grid;gap:10px}
li{display:grid;grid-template-columns:17px minmax(0,1fr) auto;gap:8px;align-items:start;line-height:1.6}
.checklist-mark{display:grid;place-items:center;width:16px;height:16px;border:1px solid #c4d0dc;border-radius:50%;margin-top:3px;font-weight:700;color:#8494a5;font-size:13px;line-height:1}
.checklist-done .checklist-mark{color:#2f8259;border-color:#a4d2bb;background:#edf7f1}.checklist-in_progress .checklist-mark{color:#3c76ad;border-color:#9ebedc;background:#edf4fb}.checklist-blocked .checklist-mark{color:#a37631;border-color:#dbc49e;background:#fff8ee}
.checklist-title{overflow-wrap:anywhere}.checklist-state{font-size:11px;color:#8191a2;white-space:nowrap;padding-top:1px}
.checklist-in_progress .checklist-state{color:#3e79b0}.checklist-blocked .checklist-state{color:#a37631}
li p{margin:2px 0 0;color:#7b8d9e;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
.checklist-paths{display:flex;flex-wrap:wrap;gap:3px 8px}.checklist-paths code{font:inherit;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#6f8296}
@media(max-width:900px){summary{min-height:42px;padding:8px 12px}ol{padding:0 12px 12px}.checklist-state{font-size:10px}}
</style>
