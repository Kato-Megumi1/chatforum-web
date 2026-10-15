import { defineStore } from "pinia";
import { ref } from "vue";
import request from "@/utils/request";
import { useUserStore } from "./user";

// Counts only: no message text, contacts, drafts or thread history in persistent state.
export const useDirectMessageStore = defineStore(
  "direct-message-counts",
  () => {
    const inbox = ref(0),
      requests = ref(0),
      total = ref(0);
    let generation = 0;
    function clear() {
      generation++;
      inbox.value = requests.value = total.value = 0;
    }
    async function refresh() {
      const user = useUserStore();
      if (!user.user || !user.token) {
        clear();
        return;
      }
      const account = user.user.id,
        stamp = ++generation;
      try {
        const data = await request.get<{
          inbox: number;
          requests: number;
          total: number;
        }>("/direct-messages/unread-count");
        if (stamp !== generation || useUserStore().user?.id !== account) return;
        inbox.value = Number.isSafeInteger(data.inbox)
          ? Math.max(0, data.inbox)
          : 0;
        requests.value = Number.isSafeInteger(data.requests)
          ? Math.max(0, data.requests)
          : 0;
        total.value = Number.isSafeInteger(data.total)
          ? Math.max(0, data.total)
          : 0;
      } catch {
        /* A count failure must not block navigation or expose stale text. */
      }
    }
    return { inbox, requests, total, clear, refresh };
  },
);
