<template>
  <section v-if="ownsSession()" class="coding-skills" aria-label="编程 Skills">
    <div class="coding-skills-header">
      <span>编程 Skills</span>
      <el-select :model-value="mode" aria-label="编程 Skills 使用方式" :disabled="busy" @update:model-value="setMode">
        <el-option label="自动选择" value="auto" />
        <el-option label="自选 Skills" value="custom" :disabled="!conversationId" />
        <el-option label="关闭" value="off" />
      </el-select>
    </div>
    <template v-if="mode === 'custom'">
      <p v-if="loading" class="coding-skill-status" role="status">加载中…</p>
      <div v-else-if="error" class="coding-skill-error" role="status"><span>{{ error }}</span><button type="button" @click="load">重试</button></div>
      <p v-else-if="!catalog.length" class="coding-skill-status" role="status">暂无可用 Skills</p>
      <el-checkbox-group v-else :model-value="selectedNames" :max="12" :disabled="busy" aria-label="可选编程 Skills" @update:model-value="setSelection">
        <div v-for="skill in catalog" :key="skill.name" class="coding-skill-row">
          <el-checkbox :value="skill.name" :label="skill.name"><span>{{ skill.title }}</span></el-checkbox>
          <a :href="skill.sourceUrl" target="_blank" rel="noopener noreferrer" :aria-label="skill.title + '来源'">来源</a>
          <p>{{ skill.description }}</p>
        </div>
      </el-checkbox-group>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import request from '@/utils/request';
import { useUserStore } from '@/stores/user';
import { readCodingSkillCatalog, type CodingSkillInfo } from '@/utils/coding-skills';
const props = defineProps<{ conversationId?: number; mode: 'auto' | 'custom' | 'off'; selected: string[]; busy?: boolean }>();
const emit = defineEmits<{ 'update:mode': [mode: 'auto' | 'custom' | 'off']; 'update:selected': [names: string[]] }>();
const user = useUserStore(), owner = user.getAuthSession();
const catalog = ref<CodingSkillInfo[]>([]), loading = ref(false), error = ref('');
const selectedNames = computed(() => props.selected.filter(name => catalog.value.some(skill => skill.name === name)));
let active = true, generation = 0, controller: AbortController | undefined;
const ownsSession = () => {
  const session = user.getAuthSession();
  return !!user.token && owner.userId !== null && session.userId === owner.userId && session.epoch === owner.epoch;
};
const identity = computed(() => {
  const session = user.getAuthSession();
  return JSON.stringify([props.conversationId, session.userId, session.epoch, !!user.token]);
});
function reset() {
  generation++; controller?.abort(); controller = undefined;
  catalog.value = []; loading.value = false; error.value = '';
}
function setMode(value: unknown) {
  if (!active || !ownsSession() || props.busy || !['auto', 'custom', 'off'].includes(value as string) || value === 'custom' && !props.conversationId) return;
  emit('update:mode', value as 'auto' | 'custom' | 'off');
}
function setSelection(value: unknown) {
  if (!active || !ownsSession() || props.busy || props.mode !== 'custom' || loading.value || error.value || !Array.isArray(value) || value.length > 12 ||
    value.some(name => typeof name !== 'string' || !catalog.value.some(skill => skill.name === name))) return;
  emit('update:selected', [...new Set(value)]);
}
async function load() {
  const cid = props.conversationId;
  if (!active || !ownsSession() || loading.value || props.mode !== 'custom' || !Number.isSafeInteger(cid) || !cid || cid < 1) return;
  const stamp = ++generation, key = identity.value;
  const connection = controller = new AbortController();
  loading.value = true; error.value = '';
  const current = () => active && stamp === generation && identity.value === key && ownsSession() && props.mode === 'custom';
  try {
    const result = await request.get(`/coding/${cid}/skills`, { signal: connection.signal, _quiet: true });
    if (current()) catalog.value = readCodingSkillCatalog(result);
  } catch { if (current()) { catalog.value = []; error.value = 'Skills 加载失败'; } }
  finally { if (current()) loading.value = false; }
}
watch([identity, () => props.mode], () => { reset(); if (props.mode === 'custom') void load(); }, { immediate: true, flush: 'sync' });
onUnmounted(() => { active = false; reset(); });
</script>

<style scoped>
.coding-skills{margin:22px 0;color:var(--el-text-color-primary)}
.coding-skills-header{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:500}
.coding-skills-header .el-select{width:148px;flex-shrink:0}
.coding-skills :deep(.el-checkbox-group){display:grid;gap:10px;margin-top:12px}
.coding-skill-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0 10px;padding:9px 12px;border:1px solid var(--el-border-color-light);border-radius:10px;background:var(--el-fill-color-extra-light)}
.coding-skill-row :deep(.el-checkbox){min-width:0;margin-right:0;white-space:normal;height:auto;min-height:30px}
.coding-skill-row :deep(.el-checkbox__label){white-space:normal;line-height:1.5;padding-left:8px}
.coding-skill-row a{align-self:center;color:var(--el-color-primary);font-size:12px;text-decoration:none}
.coding-skill-row p{grid-column:1/-1;margin:3px 0 1px;font-size:12px;line-height:1.6;color:var(--el-text-color-secondary);overflow-wrap:anywhere}
.coding-skill-status,.coding-skill-error{font-size:13px;margin:12px 0 0;color:var(--el-text-color-secondary)}
.coding-skill-error{display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--el-color-danger)}
.coding-skill-error button{font:inherit;border:0;background:transparent;padding:7px;color:var(--el-color-primary);cursor:pointer}
@media(max-width:900px){.coding-skill-row{padding:10px 12px}.coding-skill-row a{padding:8px 0}.coding-skills-header .el-select{width:140px}}
</style>
