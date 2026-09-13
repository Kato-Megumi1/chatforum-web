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
        <div class="empty-state">
          <el-empty description="更多功能开发中..." />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import request from '@/utils/request';

const route = useRoute();
const userStore = useUserStore();

const user = ref<any>(null);
const currentUserId = ref<number | null>(null);

const loadUser = async () => {
  const data = await request.get(`/users/${route.params.id}`);
  user.value = data;
};

const handleFollow = async () => {
  if (user.value.isFollowing) {
    await request.delete(`/users/${user.value.id}/follow`);
    user.value.isFollowing = false;
    user.value._count.followers--;
  } else {
    await request.post(`/users/${user.value.id}/follow`);
    user.value.isFollowing = true;
    user.value._count.followers++;
  }
};

onMounted(() => {
  currentUserId.value = userStore.user?.id || null;
  loadUser();
});
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
