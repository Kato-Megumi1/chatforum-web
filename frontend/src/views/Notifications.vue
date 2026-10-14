<template>
  <div class="notifications-page"><div class="notifications-wrapper">
    <el-page-header @back="$router.push('/forum')" title="返回社区" />
    <section class="notification-card">
      <div class="heading"><div><h1>消息通知</h1><p>{{ notifications.unreadCount }} 条未读</p></div><el-button :disabled="!notifications.unreadCount" :loading="markingAll" @click="readAll">全部已读</el-button></div>
      <el-radio-group v-model="unreadOnly" @change="page = 1; load()"><el-radio-button :value="false">全部</el-radio-button><el-radio-button :value="true">未读</el-radio-button></el-radio-group>
      <div v-loading="loading" class="notification-list">
        <el-empty v-if="!items.length && !loading" description="暂时没有新消息" />
        <article v-for="item in items" :key="item.id" class="notification-item" :class="{ unread: !item.isRead }">
          <div class="notification-dot"></div><div class="notification-body"><div class="notification-meta"><strong>{{ item.title }}</strong><span>{{ formatTime(item.createdAt) }}</span></div><p>{{ item.content }}</p>
            <div class="notification-actions"><el-button v-if="target(item)" link type="primary" @click="open(item)">查看详情</el-button><el-button v-if="!item.isRead" link :disabled="busy.has(item.id)" @click="read(item)">标记已读</el-button><span v-else>已读</span></div>
          </div>
        </article>
      </div>
      <el-pagination v-if="total > 20" layout="prev, pager, next" :pager-count="5" :page-size="20" :total="total" v-model:current-page="page" @current-change="load" />
    </section>
    <section class="notification-card subscription-card">
      <div class="heading"><div><h2>持续追踪</h2><p>后台检查更新并合并站内提醒，不需要保持页面打开。</p></div><el-button :loading="subscriptionsLoading" :disabled="subscriptionBusy.size > 0" @click="loadSubscriptions">刷新追踪</el-button></div>
      <el-alert v-if="subscriptionsError" title="追踪列表暂时无法加载，请重试。" type="error" :closable="false" />
      <div v-loading="subscriptionsLoading" class="subscription-list">
        <el-empty v-if="!subscriptions.length && !subscriptionsLoading && !subscriptionsError" description="尚未开启追踪，可在论坛或帖子详情中添加" />
        <article v-for="item in subscriptions" :key="item.id" class="subscription-item">
          <div class="subscription-scope"><strong>{{ watchTitle(item) }}</strong><el-tag size="small" :type="item.enabled ? 'success' : 'info'">{{ item.enabled ? '已开启' : '已暂停' }}</el-tag><p>{{ watchScope(item) }}</p><span>每 {{ Math.max(1, Math.round(item.cooldownSeconds / 60)) }} 分钟合并提醒</span></div>
          <div class="subscription-actions"><el-button :disabled="subscriptionBusy.has(item.id)" @click="setWatchEnabled(item)">{{ item.enabled ? '暂停' : '开启' }}</el-button><el-button type="danger" plain :disabled="subscriptionBusy.has(item.id)" @click="removeWatch(item)">删除追踪</el-button></div>
        </article>
      </div>
      <p class="subscription-note">重新开启只检查开启后的更新，不补发暂停期间的提醒。帖子下架后不会通过旧通知展示其内容。</p>
    </section>
  </div></div>
</template>
<script setup lang="ts">
import { ref, reactive, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '@/utils/request';
import { useNotificationStore } from '@/stores/notifications';
import { useUserStore } from '@/stores/user';
import { notificationTarget } from '@/utils/forum-experience';
import dayjs from 'dayjs';
import { ElMessageBox } from 'element-plus';
const router = useRouter(), notifications = useNotificationStore(), user = useUserStore();
const items = ref<any[]>([]), page = ref(1), total = ref(0), unreadOnly = ref(false), loading = ref(false), markingAll = ref(false);
const busy = reactive(new Set<number>()); let generation = 0, markAllRequest = 0;
const subscriptions = ref<any[]>([]), subscriptionsLoading = ref(false), subscriptionsError = ref(false);
const subscriptionBusy = reactive(new Set<number>()); let subscriptionGeneration = 0;
const watchLabels: Record<string, string> = { NEW_POSTS: '新帖追踪', POST_ACTIVITY: '帖子更新', HOT_RISE: '热榜变化' };
function watchTitle(item: any) { return watchLabels[String(item.kind)] || '论坛追踪'; }
function watchScope(item: any) {
  const f = item.filtersJson || {}, parts: string[] = [];
  if (f.postId) parts.push('帖子 #' + f.postId); else parts.push(f.categoryId ? '分类 #' + f.categoryId : '全站');
  if (f.query) parts.push('关键词：' + f.query);
  if (item.kind === 'HOT_RISE') parts.push((f.hours === 168 ? '7 日' : '24 小时') + (f.rankingBasis === 'published' ? '发布衰减' : '互动净变化'));
  return parts.join(' · ');
}
async function loadSubscriptions() {
  const stamp = ++subscriptionGeneration, account = user.user?.id;
  if (!account) return;
  subscriptionsLoading.value = true; subscriptionsError.value = false;
  try {
    const data = await request.get('/forum/subscriptions');
    if (stamp !== subscriptionGeneration || account !== user.user?.id) return;
    subscriptions.value = Array.isArray(data) ? data : [];
  } catch { if (stamp === subscriptionGeneration && account === user.user?.id) subscriptionsError.value = true; }
  finally { if (stamp === subscriptionGeneration) subscriptionsLoading.value = false; }
}
async function setWatchEnabled(item: any) {
  if (subscriptionBusy.has(item.id)) return;
  const account = user.user?.id, stamp = subscriptionGeneration, enabled = !item.enabled;
  subscriptionBusy.add(item.id);
  try {
    const result = await request.patch('/forum/subscriptions/' + item.id, { enabled });
    if (stamp !== subscriptionGeneration || account !== user.user?.id || result?.ok !== true) return;
    item.enabled = enabled;
  } catch { /* keep the confirmed previous state */ }
  finally { if (stamp === subscriptionGeneration) subscriptionBusy.delete(item.id); }
}
async function removeWatch(item: any) {
  if (subscriptionBusy.has(item.id)) return;
  const account = user.user?.id, stamp = subscriptionGeneration;
  try { await ElMessageBox.confirm('停止追踪并移除这条设置？已有通知会保留。', '删除追踪', { confirmButtonText: '删除', cancelButtonText: '保留', type: 'warning' }); }
  catch { return; }
  if (stamp !== subscriptionGeneration || account !== user.user?.id) return;
  subscriptionBusy.add(item.id);
  try {
    const result = await request.delete('/forum/subscriptions/' + item.id);
    if (stamp !== subscriptionGeneration || account !== user.user?.id || result?.ok !== true) return;
    subscriptions.value = subscriptions.value.filter(value => value.id !== item.id);
  } catch { /* retain the confirmed server item */ }
  finally { if (stamp === subscriptionGeneration) subscriptionBusy.delete(item.id); }
}
const formatTime = (time: string) => dayjs(time).format('MM-DD HH:mm');
function target(item: any) { return typeof item.url === 'string' && /^\/(?:forum\/post\/\d+(?:\?comment=\d+)?|user\/\d+)$/.test(item.url) ? item.url : item.url === null ? null : notificationTarget(item); }
async function load() {
  const stamp = ++generation, account = user.user?.id; loading.value = true;
  try { const data: any = await request.get('/forum/notifications', { params: { page: page.value, limit: 20, unreadOnly: unreadOnly.value } });
    if (stamp !== generation || account !== user.user?.id) return;
    items.value = data.data; total.value = data.total; notifications.unreadCount = data.unreadCount;
  } catch { /* request errors use the shared handler */ } finally { if (stamp === generation) loading.value = false; }
}
async function read(item: any) {
  if (item.isRead || busy.has(item.id)) return; busy.add(item.id);
  const account = user.user?.id, stamp = generation;
  try { await request.put('/forum/notifications/' + item.id + '/read');
    if (stamp !== generation || account !== user.user?.id) return;
    item.isRead = true;
    if (unreadOnly.value) { items.value = items.value.filter(i => i.id !== item.id); total.value = Math.max(0, total.value - 1); }
    await notifications.refresh(); }
  finally { busy.delete(item.id); }
}
async function open(item: any) { const url = target(item), account = user.user?.id; if (!url) return; await read(item); if (account === user.user?.id) router.push(url); }
async function readAll() {
  if (markingAll.value) return; markingAll.value = true;
  const account = user.user?.id, stamp = generation, action = ++markAllRequest;
  try { await request.put('/forum/notifications/read-all'); if (account !== user.user?.id || stamp !== generation) return; await notifications.refresh(); await load(); }
  finally { if (action === markAllRequest && account === user.user?.id) markingAll.value = false; }
}
watch(() => user.user?.id, () => {
  generation++; subscriptionGeneration++; markAllRequest++; items.value = []; subscriptions.value = []; page.value = 1;
  subscriptionBusy.clear(); busy.clear(); markingAll.value = false; subscriptionsLoading.value = false; subscriptionsError.value = false;
  if (user.user) { void load(); void loadSubscriptions(); }
}, { immediate: true });
onUnmounted(() => { generation++; subscriptionGeneration++; markAllRequest++; });
</script>
<style scoped lang="scss">
.notifications-page { height: 100%; overflow-y: auto; background: var(--bg-page); }
.notifications-wrapper { max-width: 860px; margin: auto; padding: 24px 20px 40px; }
.notification-card { margin-top: 20px; padding: 30px; border: 1px solid var(--border-light); background: #fff; border-radius: 20px; }
.heading, .notification-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
h1 { margin: 0; font-size: 24px; } .heading p { color: var(--text-secondary); font-size: 13px; margin: 8px 0 20px; }
h2 { margin: 0; font-size: 20px; }
.subscription-list { min-height: 80px; }
.subscription-item { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; padding: 20px 0; border-bottom: 1px solid var(--border-light); }
.subscription-scope { min-width: 0; flex: 1; }.subscription-scope strong { margin-right: 10px; }.subscription-scope p { overflow-wrap: anywhere; margin: 10px 0; font-size: 13px; }
.subscription-scope span, .subscription-note { font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
.subscription-actions { display: flex; gap: 8px; }.subscription-actions .el-button { margin-left: 0; }
.notification-list { margin-top: 20px; min-height: 160px; }
.notification-item { display: flex; gap: 12px; padding: 22px 0; border-bottom: 1px solid var(--border-light); }
.notification-dot { flex-shrink: 0; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: transparent; }
.unread .notification-dot { background: var(--primary-color); } .notification-body { min-width: 0; flex: 1; }
.notification-meta strong { overflow-wrap: anywhere; font-size: 14px; } .notification-meta span, .notification-actions span { font-size: 12px; color: var(--text-secondary); }
.notification-body p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; color: var(--text-regular); line-height: 1.7; }
.notification-actions { display: flex; gap: 16px; align-items: center; } .el-pagination { margin-top: 24px; justify-content: center; }
@media (max-width:900px) { .notifications-page { background:#faf9f7; } .notifications-wrapper { padding:16px 12px 28px; } .notification-card { padding:22px 16px; border-color:#eee7eb; } }
</style>
