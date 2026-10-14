<template>
  <div class="user-space-container">
    <div class="user-space-wrapper">
      <el-page-header @back="$router.back()" title="返回" class="page-header" />
      <div class="user-space-main" v-if="user" v-loading="!user">
        <div class="user-banner">
          <div class="banner-avatar">
            <el-avatar :size="88" :src="user.avatar" class="space-avatar">
              {{ user.username.charAt(0).toUpperCase() }}
            </el-avatar>
          </div>
          <div class="banner-info">
            <h1 class="space-name">{{ user.username }}</h1>
            <div class="space-badges">
              <el-tag type="primary" effect="plain" round>Lv.{{ user.level }}</el-tag>
              <el-tag type="success" effect="plain" round>{{ user.points }} 积分</el-tag>
            </div>
            <p class="space-bio" v-if="user.bio">{{ user.bio }}</p>
            <div class="follow-actions" v-if="currentUserId && currentUserId !== user.id">
              <el-button
                :type="user.isFollowing ? 'default' : 'primary'"
                round
                :loading="following"
                @click="handleFollow"
              >
                {{ user.isFollowing ? '已关注' : '+ 关注' }}
              </el-button>
            </div>
          </div>
        </div>
        <div class="user-counts">
          <div class="count-item">
            <div class="count-number">{{ user._count?.posts || 0 }}</div>
            <div class="count-label">帖子</div>
          </div>
          <div class="count-divider"></div>
          <div class="count-item">
            <div class="count-number">{{ user._count?.followers || 0 }}</div>
            <div class="count-label">粉丝</div>
          </div>
          <div class="count-divider"></div>
          <div class="count-item">
            <div class="count-number">{{ user._count?.following || 0 }}</div>
            <div class="count-label">关注</div>
          </div>
        </div>
        <div class="public-posts" v-loading="postsLoading">
          <h2>TA 的帖子</h2><el-empty v-if="!posts.length && !postsLoading" description="还没有公开帖子" :image-size="76" />
          <router-link v-for="post in posts" :key="post.id" class="public-post" :to="'/forum/post/' + post.id"><strong>{{ post.title }}</strong><p>{{ post.summary }}</p><small>{{ post.category?.name }} · {{ post.commentCount }} 条评论</small></router-link>
          <el-pagination v-if="total > 10" layout="prev, pager, next" :pager-count="5" :total="total" :page-size="10" v-model:current-page="page" @current-change="loadPosts" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';

const route = useRoute();
const userStore = useUserStore();

const user = ref<any>(null);
const currentUserId = ref<number | null>(null);
const posts = ref<any[]>([]), postsLoading = ref(false), following = ref(false), total = ref(0), page = ref(1);
let generation = 0, postRequest = 0;

const loadUser = async () => {
  const stamp = ++generation;
  const data = await request.get(`/users/${route.params.id}`);
  if (stamp === generation) user.value = data;
};
async function loadPosts() {
  const stamp = ++postRequest, id = route.params.id; postsLoading.value = true;
  try { const data: any = await request.get('/forum/posts', { params: { userId: id, page: page.value, limit: 10 } });
    if (stamp !== postRequest || id !== route.params.id) return; posts.value = data.data; total.value = data.total;
  } finally { if (stamp === postRequest) postsLoading.value = false; }
}

const handleFollow = async () => {
  if (following.value) return; following.value = true;
  const target = user.value;
  try {
  if (target.isFollowing) {
    await request.delete(`/users/${target.id}/follow`);
    target.isFollowing = false;
    target._count.followers = Math.max(0, target._count.followers - 1);
  } else {
    await request.post(`/users/${target.id}/follow`);
    target.isFollowing = true;
    target._count.followers++;
  }
  } finally { following.value = false; }
};

watch(() => [route.params.id, userStore.user?.id], () => {
  currentUserId.value = userStore.user?.id || null;
  user.value = null; posts.value = []; page.value = 1;
  void loadUser().catch(() => {}); void loadPosts().catch(() => {});
}, { immediate: true });
onUnmounted(() => { generation++; postRequest++; });
</script>

<style lang="scss" scoped>
.user-space-container {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-page);
}

.user-space-wrapper {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 20px;
}

.page-header {
  margin-bottom: 16px;
}

.user-space-main {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: 36px;
  box-shadow: var(--shadow-sm);
}

.user-banner {
  display: flex;
  gap: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border-light);
}

.banner-avatar {
  flex-shrink: 0;
}

.space-avatar {
  border: 3px solid var(--primary-bg);
  box-shadow: var(--shadow-sm);
}

.banner-info {
  flex: 1;
  min-width: 0;
}

.space-name {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.space-badges {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.space-bio {
  font-size: 14px;
  color: var(--text-regular);
  margin: 0 0 16px;
  line-height: 1.6;
}

.follow-actions {
  margin-top: 4px;
}

.user-counts {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 28px 0;
  border-bottom: 1px solid var(--border-light);
}

.count-item {
  text-align: center;
}

.count-number {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.count-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.count-divider {
  width: 1px;
  height: 36px;
  background: var(--border-light);
}

.empty-state {
  padding: 48px 0 16px;
}
.public-posts h2 { font-size:18px; margin:28px 0 8px; }
.public-post { display:block; color:var(--text-primary); text-decoration:none; padding:18px 0; border-bottom:1px solid var(--border-light); }
.public-post strong { font-size:14px; overflow-wrap:anywhere; } .public-post:hover strong { color:var(--primary-color); }
.public-post p { font-size:13px; line-height:1.8; color:var(--text-secondary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; }
.public-post small { color:var(--text-secondary); font-size:12px; } .el-pagination { justify-content:center; margin-top:24px; }
@media (max-width: 640px) {
  .user-space-wrapper { padding: 16px 12px 48px; }
  .user-space-main { padding: 20px 16px; }
  .user-banner { flex-wrap: wrap; gap: 16px; }
  .banner-info { flex-basis: 150px; overflow-wrap: anywhere; }
  .space-badges { flex-wrap: wrap; }
}
@media (max-width: 900px) {
  .user-space-container { background: #faf9f7; }
  .user-space-main { border: 1px solid #eee7eb; border-radius: 20px; box-shadow: none; }
}
</style>
