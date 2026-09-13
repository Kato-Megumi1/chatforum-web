<template>
  <div class="forum-container">
    <div class="forum-hero">
      <div class="hero-content">
        <h1>天大论坛</h1>
        <p>海棠花开，北洋情深 — 天津大学校园交流社区</p>
      </div>
      <el-button v-if="userStore.user" type="primary" size="large" class="btn-publish" @click="$router.push('/forum/create')">
        <el-icon><Edit /></el-icon>
        发布帖子
      </el-button>
    </div>
    <div class="forum-main">
      <aside class="forum-sidebar">
        <div class="sidebar-card">
          <div class="card-title">分类</div>
          <div class="category-list">
            <div
              class="category-item"
              :class="{ active: !categoryId }"
              @click="categoryId = ''; loadPosts()"
            >
              <span>全部</span>
              <span class="category-count">{{ total }}</span>
            </div>
            <div
              v-for="cat in categories"
              :key="cat.id"
              class="category-item"
              :class="{ active: categoryId === String(cat.id) }"
              @click="categoryId = String(cat.id); loadPosts()"
            >
              <span>{{ cat.name }}</span>
              <span class="category-count">{{ cat._count?.posts || 0 }}</span>
            </div>
          </div>
        </div>
        <div class="sidebar-card">
          <div class="card-title">热门标签</div>
          <div class="tag-cloud">
            <el-tag
              v-for="tag in tags"
              :key="tag.id"
              :effect="tagId === String(tag.id) ? 'dark' : 'plain'"
              :type="tagId === String(tag.id) ? 'primary' : 'info'"
              class="tag-item"
              @click="tagId === String(tag.id) ? (tagId = '') : (tagId = String(tag.id)); loadPosts()"
            >
              {{ tag.name }}
            </el-tag>
          </div>
        </div>
      </aside>
      <div class="forum-content">
        <div class="content-toolbar">
          <el-input
            v-model="searchText"
            placeholder="搜索帖子标题或内容..."
            prefix-icon="Search"
            size="large"
            class="search-input"
            @keyup.enter="loadPosts"
            clearable
            @clear="loadPosts"
          />
          <el-radio-group v-model="sortBy" size="default" @change="loadPosts" class="sort-group">
            <el-radio-button value="createdAt">最新</el-radio-button>
            <el-radio-button value="popular">热门</el-radio-button>
            <el-radio-button value="likes">最多点赞</el-radio-button>
          </el-radio-group>
        </div>
        <div class="post-list" v-loading="loading">
          <div v-if="posts.length === 0 && !loading" class="empty-posts">
            <el-icon :size="48" color="#C9CDD4"><Document /></el-icon>
            <p>暂无帖子</p>
          </div>
          <div v-for="post in posts" :key="post.id" class="post-card" @click="goToDetail(post.id)">
            <div class="post-card-header">
              <div class="post-badges">
                <el-tag v-if="post.isTop" type="danger" size="small" effect="dark">置顶</el-tag>
                <el-tag v-if="post.isEssence" type="warning" size="small" effect="dark">精华</el-tag>
              </div>
              <h3 class="post-title">{{ post.title }}</h3>
            </div>
            <div class="post-card-footer">
              <div class="post-author">
                <el-avatar :size="24" :src="post.user.avatar" class="author-avatar">
                  {{ post.user.username.charAt(0).toUpperCase() }}
                </el-avatar>
                <span class="author-name">{{ post.user.username }}</span>
              </div>
              <div class="post-stats">
                <span class="stat-item">
                  <el-icon><View /></el-icon>
                  {{ post.viewCount }}
                </span>
                <span class="stat-item">
                  <el-icon><ChatDotRound /></el-icon>
                  {{ post.commentCount }}
                </span>
                <span class="stat-item">
                  <el-icon><Star /></el-icon>
                  {{ post.likeCount }}
                </span>
                <span class="stat-time">{{ formatTime(post.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="pagination-wrapper" v-if="total > 0">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
            @current-change="loadPosts"
            @size-change="loadPosts"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '@/utils/request';
import { useUserStore } from '@/stores/user';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const router = useRouter();
const userStore = useUserStore();

const posts = ref<any[]>([]);
const categories = ref<any[]>([]);
const tags = ref<any[]>([]);
const categoryId = ref('');
const tagId = ref('');
const searchText = ref('');
const sortBy = ref('createdAt');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const loading = ref(false);

const loadPosts = async () => {
  loading.value = true;
  try {
    const params: any = {
      page: page.value,
      limit: pageSize.value,
      sortBy: sortBy.value,
    };
    if (categoryId.value) params.categoryId = categoryId.value;
    if (tagId.value) params.tagId = tagId.value;
    if (searchText.value) params.search = searchText.value;

    const data = await request.get('/forum/posts', { params });
    posts.value = data.data;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
};

const loadCategories = async () => {
  const data = await request.get('/forum/categories');
  categories.value = data;
};

const loadTags = async () => {
  const data = await request.get('/forum/tags');
  tags.value = data;
};

const goToDetail = (id: number) => {
  router.push(`/forum/post/${id}`);
};

const formatTime = (time: string) => {
  return dayjs(time).fromNow();
};

let tagTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  loadPosts();
  loadCategories();
  loadTags();
  // 每 5 分钟刷新热门标签
  tagTimer = setInterval(loadTags, 5 * 60 * 1000);
});

onUnmounted(() => {
  if (tagTimer) clearInterval(tagTimer);
});
</script>

<style lang="scss" scoped>
.forum-container {
  height: 100%;
  overflow-y: auto;
  background: var(--bg-page);
}

.forum-hero {
  background: linear-gradient(135deg, #EBF8FE 0%, #D6EEFB 40%, #C5E4F7 100%);
  padding: 32px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #C5E4F7;

  h1 {
    margin: 0 0 4px;
    font-size: 24px;
    color: var(--primary-dark);
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: 14px;
    color: #5A8DB5;
  }
}

.btn-publish {
  border-radius: 24px;
  height: 42px;
  padding: 0 28px;
  font-weight: 500;
  box-shadow: 0 4px 14px rgba(74, 158, 220, 0.35);
  transition: all var(--transition);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(74, 158, 220, 0.5);
  }
}

.forum-main {
  display: flex;
  padding: 24px 32px;
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.forum-sidebar {
  width: 250px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-card {
  background: #fff;
  border-radius: var(--radius-md);
  padding: 18px;
  box-shadow: var(--shadow-sm);
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid var(--primary-light);
}

.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-regular);
  transition: all var(--transition);

  &:hover {
    background: var(--bg-page);
  }

  &.active {
    background: var(--primary-bg);
    color: var(--primary-color);
    font-weight: 600;

    .category-count {
      color: var(--primary-color);
    }
  }
}

.category-count {
  font-size: 11px;
  color: var(--text-placeholder);
  background: var(--bg-page);
  padding: 2px 8px;
  border-radius: 10px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    transform: translateY(-1px);
  }
}

.forum-content {
  flex: 1;
  min-width: 0;
}

.content-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  max-width: 360px;

  :deep(.el-input__wrapper) {
    border-radius: 24px;
    box-shadow: var(--shadow-sm);
  }
}

.sort-group {
  :deep(.el-radio-button__inner) {
    border-radius: 20px;
  }
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-posts {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 0;
  color: var(--text-secondary);

  p {
    margin-top: 12px;
    font-size: 14px;
  }
}

.post-card {
  background: #fff;
  border-radius: var(--radius-md);
  padding: 20px 24px;
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: var(--shadow-sm);
  border-left: 3px solid transparent;
  position: relative;

  &:hover {
    border-left-color: var(--primary-color);
    box-shadow: 0 4px 16px rgba(74, 158, 220, 0.12);
    transform: translateX(2px);
  }
}

.post-card-header {
  margin-bottom: 14px;
}

.post-badges {
  margin-bottom: 8px;
  display: flex;
  gap: 6px;
}

.post-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.post-author {
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-avatar {
  flex-shrink: 0;
}

.author-name {
  font-size: 13px;
  color: var(--text-regular);
  font-weight: 500;
}

.post-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-time {
  color: var(--text-placeholder);
  font-size: 12px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}
</style>
