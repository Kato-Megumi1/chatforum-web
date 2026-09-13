<template>
  <el-container class="main-layout">
    <el-header class="header">
      <div class="header-left">
        <div class="logo" @click="$router.push('/')">
          <img :src="publicAsset('tju-logo.png')" alt="天大校徽" class="logo-img" />
          <span class="logo-text">天大论坛</span>
        </div>
      </div>
      <el-menu
        :default-active="activeMenu"
        mode="horizontal"
        :ellipsis="false"
        class="header-menu"
        @select="handleSelect"
      >
        <el-menu-item index="/chat">
          <el-icon><ChatDotRound /></el-icon>
          <span>AI 对话</span>
        </el-menu-item>
        <el-menu-item index="/forum">
          <el-icon><ChatLineSquare /></el-icon>
          <span>社区论坛</span>
        </el-menu-item>
        <el-menu-item index="/knowledge-bases">
          <el-icon><Collection /></el-icon>
          <span>小说库</span>
        </el-menu-item>
      </el-menu>
      <div class="header-right">
        <template v-if="userStore.user">
          <el-dropdown trigger="click">
            <div class="user-info">
              <el-avatar :size="34" :src="userStore.user.avatar" class="user-avatar">
                {{ userStore.user.username.charAt(0).toUpperCase() }}
              </el-avatar>
              <span class="username">{{ userStore.user.username }}</span>
              <el-icon class="arrow-icon"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="$router.push('/user/profile')">
                  <el-icon><User /></el-icon>
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
        <template v-else>
          <el-button class="btn-login" @click="$router.push('/login')">登录</el-button>
          <el-button class="btn-register" type="primary" @click="$router.push('/register')">注册</el-button>
        </template>
      </div>
    </el-header>
    <el-main class="main-content">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { publicAsset } from '@/utils/api';
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const activeMenu = computed(() => {
  const path = route.path;
  if (path.startsWith('/forum')) return '/forum';
  return path;
});

const handleSelect = (key: string) => {
  router.push(key);
};

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await userStore.logout();
    ElMessage.success('已退出登录');
    router.push('/login');
  } catch (err: any) {
    if (err !== 'cancel' && err?.message !== 'cancel') {
      console.error('Logout failed:', err);
      userStore.clearAuth();
      router.push('/login');
    }
  }
};
</script>

<style lang="scss" scoped>
.main-layout {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: #fff;
  border-bottom: 2px solid var(--primary-bg);
  height: 60px;
  box-shadow: 0 1px 4px rgba(74, 158, 220, 0.08);
  position: relative;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary-dark);
  letter-spacing: 0.5px;
}

.header-menu {
  flex: 1;
  justify-content: center;
  border: none !important;
  height: 60px;

  :deep(.el-menu-item) {
    height: 60px;
    line-height: 60px;
    font-size: 14px;
    color: var(--text-regular);
    border-bottom: 2px solid transparent;
    transition: all var(--transition);

    &:hover {
      color: var(--primary-color);
      background: transparent;
    }

    &.is-active {
      color: var(--primary-color);
      font-weight: 600;
      border-bottom-color: var(--primary-color);
    }
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 14px;
  border-radius: 24px;
  transition: all var(--transition);
  border: 1px solid transparent;

  &:hover {
    background: var(--bg-page);
    border-color: var(--border-color);
  }
}

.user-avatar {
  flex-shrink: 0;
  border: 2px solid var(--primary-bg);
}

.username {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon {
  color: var(--text-secondary);
  font-size: 12px;
  transition: transform var(--transition);
}

.user-info:hover .arrow-icon {
  transform: rotate(180deg);
}

.btn-login {
  border-radius: 20px;
  font-weight: 500;
}

.btn-register {
  border-radius: 20px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(74, 158, 220, 0.3);
}

.main-content {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

@media (max-width: 640px) {
  .main-layout { height: 100dvh; }
  .header { padding: 0 8px; gap: 4px; }
  .logo-text, .username, .arrow-icon, .btn-register { display: none; }
  .logo-img { width: 28px; height: 28px; }
  .header-menu { min-width: 0; }
  .header-menu :deep(.el-menu-item) { padding: 0 7px; font-size: 12px; }
  .header-menu :deep(.el-icon) { margin-right: 3px; width: 16px; }
  .user-info { padding: 0; }
  .header-right { gap: 0; flex-shrink: 0; }
}
</style>
