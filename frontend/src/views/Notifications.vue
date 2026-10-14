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
const router = useRouter(), notifications = useNotificationStore(), user = useUserStore();
const items = ref<any[]>([]), page = ref(1), total = ref(0), unreadOnly = ref(false), loading = ref(false), markingAll = ref(false);
const busy = reactive(new Set<number>()); let generation = 0;
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
  try { await request.put('/forum/notifications/' + item.id + '/read'); item.isRead = true;
    if (unreadOnly.value) { items.value = items.value.filter(i => i.id !== item.id); total.value = Math.max(0, total.value - 1); }
    await notifications.refresh(); }
  finally { busy.delete(item.id); }
}
async function open(item: any) { const url = target(item); if (!url) return; await read(item); router.push(url); }
async function readAll() {
  if (markingAll.value) return; markingAll.value = true;
  try { await request.put('/forum/notifications/read-all'); await notifications.refresh(); await load(); }
  finally { markingAll.value = false; }
}
watch(() => user.user?.id, () => { items.value = []; page.value = 1; if (user.user) void load(); }, { immediate: true });
onUnmounted(() => { generation++; });
</script>
<style scoped lang="scss">
.notifications-page { height: 100%; overflow-y: auto; background: var(--bg-page); }
.notifications-wrapper { max-width: 860px; margin: auto; padding: 24px 20px 40px; }
.notification-card { margin-top: 20px; padding: 30px; border: 1px solid var(--border-light); background: #fff; border-radius: 20px; }
.heading, .notification-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
h1 { margin: 0; font-size: 24px; } .heading p { color: var(--text-secondary); font-size: 13px; margin: 8px 0 20px; }
.notification-list { margin-top: 20px; min-height: 160px; }
.notification-item { display: flex; gap: 12px; padding: 22px 0; border-bottom: 1px solid var(--border-light); }
.notification-dot { flex-shrink: 0; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: transparent; }
.unread .notification-dot { background: var(--primary-color); } .notification-body { min-width: 0; flex: 1; }
.notification-meta strong { overflow-wrap: anywhere; font-size: 14px; } .notification-meta span, .notification-actions span { font-size: 12px; color: var(--text-secondary); }
.notification-body p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; color: var(--text-regular); line-height: 1.7; }
.notification-actions { display: flex; gap: 16px; align-items: center; } .el-pagination { margin-top: 24px; justify-content: center; }
@media (max-width:900px) { .notifications-page { background:#faf9f7; } .notifications-wrapper { padding:16px 12px 28px; } .notification-card { padding:22px 16px; border-color:#eee7eb; } }
</style>
