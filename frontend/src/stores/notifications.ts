import { ref } from 'vue';
import { defineStore } from 'pinia';
import request from '@/utils/request';
import { useUserStore } from './user';

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0);
  let generation = 0;
  function clear() { generation++; unreadCount.value = 0; }
  async function refresh() {
    const user = useUserStore(); if (!user.user || !user.token) { clear(); return; }
    const account = user.user.id, stamp = ++generation;
    try { const result: any = await request.get('/forum/notifications/unread-count');
      if (stamp === generation && useUserStore().user?.id === account) unreadCount.value = result.unreadCount;
    } catch { /* notification badges must not block navigation */ }
  }
  return { unreadCount, refresh, clear };
});
