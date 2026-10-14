<template>
  <section class="forum-activity">
    <el-tabs v-model="active" @tab-change="changeTab">
      <el-tab-pane label="我的帖子" name="posts" /><el-tab-pane label="我的回复" name="replies" />
      <el-tab-pane label="我的收藏" name="favorites" /><el-tab-pane label="我的关注" name="following" />
    </el-tabs>
    <div v-loading="loading" class="activity-list">
      <el-empty v-if="!items.length && !loading" :description="emptyText" :image-size="76" />
      <template v-for="item in items" :key="item.id">
        <router-link v-if="active === 'following'" class="activity-item follow-item" :to="'/user/' + item.id"><el-avatar :src="item.avatar" :size="38">{{ item.username.slice(0, 1) }}</el-avatar><div><strong>{{ item.username }}</strong><p>{{ item.bio || '去看看 TA 的主页' }}</p></div></router-link>
        <router-link v-else-if="active === 'replies' && item.post?.status === 'APPROVED'" class="activity-item" :to="'/forum/post/' + item.post.id + '?comment=' + item.id"><strong>{{ item.post.title }}</strong><p class="reply-content">{{ item.content }}</p><small>{{ date(item.createdAt) }} · 查看这条回复</small></router-link>
        <div v-else-if="active === 'replies'" class="activity-item"><strong>原帖已不可访问</strong><p>{{ item.content }}</p></div>
        <router-link v-else class="activity-item" :to="'/forum/post/' + item.id"><strong>{{ item.title }}</strong><p>{{ item.summary }}</p><small>{{ item.category?.name }} · {{ date(item.createdAt) }} · {{ item.commentCount }} 条评论<span v-if="item.status && item.status !== 'APPROVED'"> · {{ item.status === 'PENDING' ? '审核中' : '暂未公开' }}</span></small></router-link>
      </template>
    </div>
    <el-pagination v-if="total > 10" layout="prev, pager, next" :page-size="10" :total="total" :pager-count="5" v-model:current-page="page" @current-change="load" />
  </section>
</template>
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';
import dayjs from 'dayjs';
const route = useRoute(), router = useRouter(), user = useUserStore();
const active = ref('posts'), page = ref(1), total = ref(0), items = ref<any[]>([]), loading = ref(false);
let generation = 0;
const date = (time: string) => dayjs(time).format('YYYY-MM-DD');
const emptyText = computed(() => ({ posts: '还没有发布帖子', replies: '还没有参与讨论', favorites: '遇到喜欢的帖子，可以收藏在这里', following: '关注感兴趣的社区成员' }[active.value] || '暂无内容'));
async function load() {
  const stamp = ++generation, account = user.user?.id; loading.value = true;
  try { const data: any = await request.get('/forum/me/' + active.value, { params: { page: page.value, limit: 10 } });
    if (stamp !== generation || account !== user.user?.id) return; items.value = data.data; total.value = data.total;
  } finally { if (stamp === generation) loading.value = false; }
}
function changeTab() { page.value = 1; router.replace({ query: { ...route.query, activity: active.value } }); }
watch(() => [route.query.activity, user.user?.id], () => { active.value = ['posts', 'replies', 'favorites', 'following'].includes(String(route.query.activity)) ? String(route.query.activity) : 'posts'; page.value = 1; items.value = []; if (user.user) void load().catch(() => {}); }, { immediate: true });
onUnmounted(() => { generation++; });
</script>
<style scoped lang="scss">
.activity-list { min-height:160px; } .activity-item { display:block; color:var(--text-primary); text-decoration:none; padding:18px 0; border-bottom:1px solid var(--border-light); }
.activity-item:hover strong { color:var(--primary-color); } .activity-item strong { font-size:14px; overflow-wrap:anywhere; }
.activity-item p { font-size:13px; line-height:1.8; color:var(--text-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; margin:8px 0; }
.activity-item small { font-size:11px; color:var(--text-secondary); } .follow-item { display:flex; align-items:center; gap:14px; } .follow-item .el-avatar { flex-shrink:0; }
.reply-content { white-space:pre-wrap; } .el-pagination { margin-top:24px; justify-content:center; }
.forum-activity :deep(.el-tabs__nav-wrap) { overflow:auto; } .forum-activity :deep(.el-tabs__item) { padding:0 12px; }
</style>
